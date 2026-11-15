import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  boardSchema,
  parseBoard,
  legacyBoardSchema,
  v2BoardSchema,
  emptyBoard,
  reduceBoard,
  type Board,
  type Command,
} from "../shared/model";
import { exportMarkdown } from "../shared/export";
import { claimOwner, readOwner } from "./ownership";

export type Location = { projectId: string; root: string };
export type Snapshot = {
  board: Board;
  fingerprint: string;
  root: string;
  warning?: string;
  migrationRequired?: boolean;
};
const fingerprint = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function missing(e: unknown): boolean {
  return (e as { code?: string }).code === "ENOENT";
}
export class BoardStore {
  constructor(private serviceOwnerNonce?: string) {}
  private queues = new Map<string, Promise<unknown>>();
  private empty = new Map<string, Board>();
  private knownExisting = new Set<string>();
  private async exclusive<T>(root: string, fn: () => Promise<T>): Promise<T> {
    const key = process.platform === "win32" ? root.toLowerCase() : root;
    const prior = this.queues.get(key) || Promise.resolve();
    const current = prior.catch(() => {}).then(fn);
    this.queues.set(key, current);
    try {
      return await current;
    } finally {
      if (this.queues.get(key) === current) this.queues.delete(key);
    }
  }
  async canonical(location: Location): Promise<Location> {
    if (!path.isAbsolute(location.root))
      throw new Error("Raiz de projeto precisa ser absoluta.");
    return { ...location, root: await realpath(location.root) };
  }
  private async paths(location: Location) {
    const dir = path.join(location.root, ".business-board");
    for (const name of [
      dir,
      path.join(dir, "board.json"),
      path.join(dir, "board.backup.json"),
      path.join(dir, "board.md"),
      path.join(dir, "board.v1.backup.json"),
      path.join(dir, "board.v2.backup.json"),
    ]) {
      try {
        const s = await lstat(name);
        if (s.isSymbolicLink())
          throw new Error(
            "Board recusado: links simbólicos não são permitidos.",
          );
        if (name === dir ? !s.isDirectory() : !s.isFile())
          throw new Error("Caminho do board não é do tipo esperado.");
      } catch (e) {
        if (!missing(e)) throw e;
      }
    }
    return {
      dir,
      file: path.join(dir, "board.json"),
      backup: path.join(dir, "board.backup.json"),
      markdown: path.join(dir, "board.md"),
      migrationBackup: path.join(dir, "board.v1.backup.json"),
      v2Backup: path.join(dir, "board.v2.backup.json"),
    };
  }
  private decode(raw: string): Board {
    const board = parseBoard(JSON.parse(raw));
    const ids = board.sections.flatMap((s) => [
      s.id,
      ...s.cards.map((c) => c.id),
    ]);
    if (new Set(ids).size !== ids.length)
      throw new Error("Arquivo contém IDs duplicados.");
    return board;
  }
  private async read(location: Location): Promise<Snapshot> {
    const p = await this.paths(location);
    let raw: string;
    try {
      raw = await readFile(p.file, "utf8");
    } catch (e) {
      if (missing(e)) {
        if (this.knownExisting.has(location.root))
          throw new Error(
            "O arquivo canônico desapareceu. Restaure board.json ou seu backup antes de continuar.",
          );
        try {
          await readFile(p.backup, "utf8");
          throw new Error(
            `board.json ausente. Backup preservado em ${p.backup}; restaure o arquivo antes de continuar.`,
          );
        } catch (backupError) {
          if (!missing(backupError)) throw backupError;
        }
        let board = this.empty.get(location.root);
        if (!board) {
          board = emptyBoard(`board-${randomUUID()}`);
          this.empty.set(location.root, board);
        }
        return { board, fingerprint: "missing", root: location.root };
      }
      throw e;
    }
    try {
      this.knownExisting.add(location.root);
      return {
        board: this.decode(raw),
        fingerprint: fingerprint(raw),
        root: location.root,
        ...([1, 2].includes(JSON.parse(raw).schemaVersion)
          ? {
              migrationRequired: true,
              warning:
                "Board antigo compatível. Pare o gravador antigo e confirme a migração para v3 antes de editar.",
            }
          : {}),
      };
    } catch (e) {
      let backup = "Nenhum backup válido disponível.";
      try {
        this.decode(await readFile(p.backup, "utf8"));
        backup = `Backup válido preservado em ${p.backup}. Corrija/restaure o arquivo manualmente e recarregue.`;
      } catch {
        /* preserve malformed main and last backup */
      }
      throw new Error(
        `board.json inválido ou incompatível. ${backup} Causa: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  async get(raw: Location): Promise<Snapshot> {
    const loc = await this.canonical(raw);
    return this.exclusive(loc.root, () => this.read(loc));
  }
  private async atomic(destination: string, text: string) {
    const temp = path.join(
      path.dirname(destination),
      `.tmp-${randomUUID()}.json`,
    );
    try {
      await writeFile(temp, text, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await rename(temp, destination);
    } finally {
      try {
        await unlink(temp);
      } catch (e) {
        if (!missing(e)) throw e;
      }
    }
  }
  async apply(
    raw: Location,
    expectedRevision: number,
    expectedFingerprint: string,
    command: Command,
    receipt?: { id: string; value: string },
  ): Promise<Snapshot> {
    const loc = await this.canonical(raw);
    return this.exclusive(loc.root, async () => {
      const ownedPaths = await this.paths(loc);
      await mkdir(ownedPaths.dir, { recursive: true });
      await this.paths(loc);
      const serviceOwner = await readOwner(path.join(ownedPaths.dir, "service.owner.json"));
      if (serviceOwner && serviceOwner.nonce !== this.serviceOwnerNonce) throw new Error("OWNER_BUSY: use the local service API to write this board.");
      const writer = await claimOwner(path.join(ownedPaths.dir, "writer.owner.json"));
      try {
      // Fence a service that may have claimed ownership between the first read
      // and our writer claim. Service startup fences this same writer gate.
      const latestOwner = await readOwner(path.join(ownedPaths.dir, "service.owner.json"));
      if (latestOwner && latestOwner.nonce !== this.serviceOwnerNonce) throw new Error("OWNER_BUSY: local service claimed this board.");
      const current = await this.read(loc);
      if (receipt && current.board.receipts[receipt.id]) {
        if (current.board.receipts[receipt.id] !== receipt.value)
          throw new Error("requestId já usado com conteúdo diferente.");
        return current;
      }
      if (
        current.board.revision !== expectedRevision ||
        current.fingerprint !== expectedFingerprint
      )
        throw new Error(
          "CONFLICT: o board mudou em outra aba, agente ou editor. Seu rascunho foi preservado. Recarregue e revise antes de salvar novamente.",
        );
      const next = reduceBoard(current.board, command);
      if (receipt) next.receipts[receipt.id] = receipt.value;
      const p = await this.paths(loc);
      await mkdir(p.dir, { recursive: true });
      await this.paths(loc);
      // Re-read immediately before writing: external editors are not part of this process queue.
      const latest = await this.read(loc);
      if (latest.fingerprint !== current.fingerprint)
        throw new Error(
          "CONFLICT: edição externa detectada; rascunho preservado.",
        );
      const priorRaw =
        current.fingerprint !== "missing"
          ? await readFile(p.file, "utf8")
          : null;
      if (priorRaw && fingerprint(priorRaw) !== current.fingerprint)
        throw new Error(
          "CONFLICT: edição externa detectada antes do backup; rascunho preservado.",
        );
      if (priorRaw && JSON.parse(priorRaw).schemaVersion === 1) {
        try {
          await writeFile(p.migrationBackup, priorRaw, {
            encoding: "utf8",
            flag: "wx",
            mode: 0o600,
          });
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          const preserved = legacyBoardSchema.parse(
            JSON.parse(await readFile(p.migrationBackup, "utf8")),
          );
          if (preserved.boardId !== current.board.boardId)
            throw new Error(
              "Backup v1 pertence a outro board; nenhum arquivo foi substituído.",
            );
        }
      }
      if (priorRaw && JSON.parse(priorRaw).schemaVersion === 2) {
        try { await writeFile(p.v2Backup, priorRaw, { encoding: "utf8", flag: "wx", mode: 0o600 }); }
        catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          const preserved = v2BoardSchema.parse(JSON.parse(await readFile(p.v2Backup, "utf8")));
          if (preserved.boardId !== current.board.boardId) throw new Error("Backup v2 belongs to another board.");
        }
      }
      if (priorRaw) await this.atomic(p.backup, priorRaw);
      const encoded = JSON.stringify(next, null, 2) + "\n";
      await this.atomic(p.file, encoded);
      this.knownExisting.add(loc.root);
      return { board: next, fingerprint: fingerprint(encoded), root: loc.root };
      } finally { await writer.release(); }
    });
  }
  async export(raw: Location, save: boolean) {
    const loc = await this.canonical(raw);
    return this.exclusive(loc.root, async () => {
      const snapshot = await this.read(loc);
      const markdown = exportMarkdown(snapshot.board);
      if (!save) return { markdown, path: null };
      const p = await this.paths(loc);
      await mkdir(p.dir, { recursive: true });
      await this.paths(loc);
      await this.atomic(p.markdown, markdown);
      return { markdown, path: p.markdown };
    });
  }
}
