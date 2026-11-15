import { realpath } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { boardSchema, type Command } from "../shared/model";
import { skillPreviewSchema, skillVersionSchema, type SkillVersion } from "../shared/evolution";
import { BoardStore, type Location, type Snapshot } from "./store";
import { SkillRepository } from "./skills";
import { call, serviceRequest, serviceRuntime, setHumanSession } from "./service-client";

function openCommand(root: string): string {
  const quoted = process.platform === "win32"
    ? `'${root.replace(/'/g, "''")}'`
    : `'${root.replace(/'/g, "'\\''")}'`;
  return `business open --root ${quoted}`;
}

/** The optional Paseo adapter never starts a service or writes project files. */
export async function remoteRequest<T>(location: Location, method: string, route: string, body?: unknown, capability: "human" | "agent" = "human"): Promise<T> {
  const root = await realpath(location.root);
  try {
    return await (capability === "agent" ? serviceRequest(root, route, body, "agent", method) : call(root, method, route, body)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/PAIRING_REQUIRED|UNAUTHORIZED|human capability/i.test(message)) {
      throw new Error("PAIRING_REQUIRED: Gere um código temporário no visualizador Business Map e use Código do Business Map → Conectar neste painel. Reconecte após reiniciar o serviço ou o daemon.");
    }
    if (/MIGRATION_REQUIRED/.test(message)) {
      throw new Error("MIGRATION_REQUIRED: Revise e confirme a migração do board antigo no visualizador Business Map antes de salvar. O conteúdo continua disponível para leitura.");
    }
    // Preserve domain errors (especially conflicts) without displaying tokens or transport internals.
    if (/CONFLICT|requestId|externally_modified|OWNER_BUSY/.test(message)) throw error;
    if (/fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout|aborted|local service|runtime|authentication|identity changed/i.test(message)) {
      throw new Error(`Business Map indisponível. Execute ${openCommand(root)} no computador do daemon e tente novamente. O plugin não grava arquivos sem o serviço.`);
    }
    throw error;
  }
}

export async function pairRemoteService(location: Location, code: string) {
  const root = await realpath(location.root);
  try {
    const runtime = await serviceRuntime(root);
    const response = await fetch(`${runtime.url}/api/pair/paseo`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
    });
    const result = await response.json() as { token?: unknown };
    if (!response.ok || typeof result.token !== "string" || !result.token) {
      throw new Error("Código inválido, expirado ou já utilizado. Gere outro código no visualizador Business Map.");
    }
    await setHumanSession(root, result.token);
    return { connected: true as const, message: "Business Map conectado nesta sessão do daemon. Reconecte após reiniciar o serviço ou o daemon." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/fetch failed|ECONNREFUSED|timeout|local service|runtime/i.test(message)) {
      throw new Error(`Business Map indisponível. Execute ${openCommand(root)} e gere um novo código no visualizador.`);
    }
    throw error;
  }
}

export class RemoteBoardStore extends BoardStore {
  override async canonical(location: Location): Promise<Location> {
    if (!path.isAbsolute(location.root)) throw new Error("Raiz de projeto precisa ser absoluta.");
    return { ...location, root: await realpath(location.root) };
  }
  private async snapshot(location: Location, method: string, route: string, body?: unknown): Promise<Snapshot> {
    const canonical = await this.canonical(location);
    const result = await remoteRequest<Snapshot>(canonical, method, route, body, method === "GET" ? "agent" : "human");
    return this.validateSnapshot(canonical, result);
  }
  private async validateSnapshot(canonical: Location, result: Snapshot): Promise<Snapshot> {
    const returnedRoot = await realpath(result.root);
    if ((process.platform === "win32" ? returnedRoot.toLowerCase() : returnedRoot) !== (process.platform === "win32" ? canonical.root.toLowerCase() : canonical.root)) {
      throw new Error("Serviço Business Map respondeu por outro projeto. Revise a conexão.");
    }
    if (typeof result.fingerprint !== "string") throw new Error("Resposta do serviço Business Map inválida.");
    return { ...result, board: boardSchema.parse(result.board), root: canonical.root };
  }
  override async get(location: Location): Promise<Snapshot> {
    return this.snapshot(location, "GET", "/api/context");
  }
  override async apply(location: Location, expectedRevision: number, expectedFingerprint: string, command: Command, receipt?: { id: string; value: string }): Promise<Snapshot> {
    if (command.type === "suggestion.submit") {
      const canonical = await this.canonical(location);
      const { id, requestId, sourceAgentId, baseRevision, createdAt, status, stale, ...suggestion } = command.suggestion;
      const result = await remoteRequest<{ snapshot: Snapshot }>(canonical, "POST", "/api/suggestions", { requestId, sourceAgentId, baseRevision, suggestion }, "agent");
      return this.validateSnapshot(canonical, result.snapshot);
    }
    const requestId = receipt
      ? `paseo:${createHash("sha256").update(receipt.id).digest("hex")}`
      : `paseo:${randomUUID()}`;
    return this.snapshot(location, "POST", "/api/command", { expectedRevision, expectedFingerprint, command, requestId, ...(receipt ? { receipt } : {}) });
  }
  override async export(location: Location, save: boolean): Promise<{ markdown: string; path: string | null }> {
    return remoteRequest(location, "POST", "/api/export", { save }, save ? "human" : "agent");
  }
}

/** All public filesystem operations are overridden, including previews and exports. */
export class RemoteSkillRepository extends SkillRepository {
  constructor(private readonly location?: Location) { super(); }
  forProject(location: Location): RemoteSkillRepository { return new RemoteSkillRepository(location); }
  override async preview(sourcePath: string, sourceUrl = "") {
    if (!this.location) throw new Error("A prévia precisa do projeto canônico.");
    return skillPreviewSchema.parse(await remoteRequest(this.location, "POST", "/api/skills/preview", { sourcePath, sourceUrl }));
  }
  override async import(location: Location, sourcePath: string, expectedTreeHash: string, sourceUrl = "") {
    return skillVersionSchema.parse(await remoteRequest(location, "POST", "/api/skills/import", { sourcePath, expectedTreeHash, sourceUrl, stageOnly: true }));
  }
  override async read(location: Location, version: SkillVersion, resource = "SKILL.md"): Promise<Awaited<ReturnType<SkillRepository["read"]>>> {
    return remoteRequest(location, "GET", `/api/skills/${encodeURIComponent(version.id)}?resource=${encodeURIComponent(resource)}`, undefined, "agent");
  }
  override async previewDerived(location: Location, parent: SkillVersion, skillText: string, rationale: string) {
    return skillPreviewSchema.parse(await remoteRequest(location, "POST", "/api/skills/derive-preview", { versionId: parent.id, skillText, rationale }));
  }
  override async derive(location: Location, parent: SkillVersion, skillText: string, rationale: string, expectedTreeHash: string) {
    return skillVersionSchema.parse(await remoteRequest(location, "POST", "/api/skills/derive", { versionId: parent.id, skillText, rationale, expectedTreeHash, stageOnly: true }));
  }
  override async export(location: Location, version: SkillVersion): Promise<Awaited<ReturnType<SkillRepository["export"]>>> {
    return remoteRequest(location, "POST", "/api/skills/export", { versionId: version.id });
  }
}
