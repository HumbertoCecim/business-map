import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { Location } from "./store";
import {
  skillVersionSchema,
  textDiff,
  type SkillPreview,
  type SkillVersion,
} from "../shared/evolution";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const MAX_FILE = 2_000_000,
  MAX_TOTAL = 20_000_000,
  MAX_FILES = 400;
type Material = { preview: SkillPreview; bytes: Map<string, Buffer> };
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";
export function validateRelativePath(value: string): string {
  if (
    !value ||
    value.includes("\\") ||
    value.includes(":") ||
    value.startsWith("/") ||
    value
      .split("/")
      .some(
        (s) =>
          !s ||
          s === "." ||
          s === ".." ||
          /[\x00-\x1f]/.test(s) ||
          /[. ]$/.test(s),
      )
  )
    throw new Error("Caminho de recurso inválido ou fora da skill.");
  return value;
}
async function noLinks(absolute: string) {
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await lstat(current);
    if (stat.isSymbolicLink())
      throw new Error(
        "Links simbólicos/junctions não são permitidos em skills.",
      );
  }
}
function encoding(bytes: Buffer): "utf8" | "base64" {
  const text = bytes.toString("utf8");
  return !text.includes("\0") && Buffer.from(text, "utf8").equals(bytes)
    ? "utf8"
    : "base64";
}
function metadata(text: string, fallback: string) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] || "";
  const clean = (v: string) => v.trim().replace(/^['"]|['"]$/g, "");
  const name = clean(/^name:\s*(.+)$/m.exec(front)?.[1] || fallback).slice(
    0,
    500,
  );
  let description = clean(/^description:\s*(.+)$/m.exec(front)?.[1] || "");
  if (/^[>|][+-]?$/.test(description)) {
    const lines = front.split(/\r?\n/),
      start = lines.findIndex((l) => /^description:/.test(l));
    const block: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (line.trim() && !/^\s/.test(line)) break;
      block.push(line.trim());
    }
    description = block.join(description.startsWith("|") ? "\n" : " ").trim();
  }
  return {
    name,
    description: description.slice(0, 3000),
    warnings: [
      ...(!front
        ? [
            "SKILL.md não contém frontmatter YAML; confirme se é a skill correta.",
          ]
        : []),
      ...(!description ? ["Descrição da skill não informada."] : []),
      ...(/\.\.\//.test(text)
        ? [
            "A skill menciona caminhos externos à pasta. Eles não são importados automaticamente.",
          ]
        : []),
    ],
  };
}
function treeHash(files: SkillVersion["files"]) {
  return hash(
    JSON.stringify(
      files.map(({ path, size, sha256, encoding }) => ({
        path,
        size,
        sha256,
        encoding,
      })),
    ),
  );
}

export class SkillRepository {
  private async material(
    sourcePath: string,
    sourceUrl = "",
  ): Promise<Material> {
    if (!path.isAbsolute(sourcePath))
      throw new Error(
        "Informe o caminho absoluto de uma pasta local que contém SKILL.md.",
      );
    const root = await realpath(sourcePath);
    if (!(await lstat(root)).isDirectory())
      throw new Error("A origem precisa ser uma pasta de skill.");
    const bytes = new Map<string, Buffer>();
    const folded = new Set<string>();
    let ignoredGit = false;
    let total = 0;
    const walk = async (directory: string, prefix: string) => {
      const entries = (await readdir(directory, { withFileTypes: true })).sort(
        (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      );
      for (const entry of entries) {
        if (entry.name.toLowerCase() === ".git") {
          ignoredGit = true;
          continue;
        }
        const rel = validateRelativePath(
          prefix ? `${prefix}/${entry.name}` : entry.name,
        );
        const fold = rel.normalize("NFC").toLowerCase();
        if (folded.has(fold))
          throw new Error("Colisão de nomes/case no pacote da skill.");
        folded.add(fold);
        const full = path.join(directory, entry.name);
        const stat = await lstat(full);
        if (stat.isSymbolicLink())
          throw new Error(
            "Links simbólicos/junctions não são permitidos em skills.",
          );
        if (stat.isDirectory()) await walk(full, rel);
        else if (stat.isFile()) {
          if (stat.size > MAX_FILE || bytes.size >= MAX_FILES)
            throw new Error(
              "Skill excede o limite de 400 arquivos ou 2 MB por arquivo.",
            );
          const content = await readFile(full);
          total += content.length;
          if (content.length > MAX_FILE || total > MAX_TOTAL)
            throw new Error("Skill excede o limite total de 20 MB.");
          bytes.set(rel, content);
        } else
          throw new Error("A skill contém um arquivo especial não suportado.");
      }
    };
    await walk(root, "");
    const skill = bytes.get("SKILL.md");
    if (!skill || encoding(skill) !== "utf8" || !skill.toString("utf8").trim())
      throw new Error("A pasta precisa conter SKILL.md em UTF-8, não vazio.");
    const files = [...bytes.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, content]) => ({
        path,
        size: content.length,
        sha256: hash(content),
        encoding: encoding(content),
      }));
    const digest = treeHash(files);
    const skillId = `skill-${digest.slice(0, 20)}`;
    const meta = metadata(skill.toString("utf8"), path.basename(root));
    const version: SkillVersion = {
      id: `${skillId}@${digest}`,
      skillId,
      name: meta.name,
      description: meta.description,
      treeHash: digest,
      files,
      sourcePath: root,
      sourceUrl,
      createdAt: new Date().toISOString(),
      parentVersionId: null,
      originalVersionId: null,
      rationale: "Importação integral confirmada pela pessoa.",
      diff: "",
    };
    version.originalVersionId = version.id;
    return {
      preview: {
        version,
        skillText: skill.toString("utf8"),
        warnings: [
          ...meta.warnings,
          ...(ignoredGit
            ? [
                "Metadados .git foram ignorados; não fazem parte do conteúdo da skill.",
              ]
            : []),
        ],
        totalBytes: total,
      },
      bytes,
    };
  }
  async preview(sourcePath: string, sourceUrl = "") {
    return (await this.material(sourcePath, sourceUrl)).preview;
  }
  private async managed(location: Location) {
    const root = await realpath(location.root);
    let current = root;
    for (const segment of [".business-board", "skills"]) {
      current = path.join(current, segment);
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
      await noLinks(current);
      if (!(await lstat(current)).isDirectory())
        throw new Error("Pasta canônica de skills inválida.");
    }
    return current;
  }
  private async versionRoot(location: Location, version: SkillVersion) {
    skillVersionSchema.parse(version);
    if (
      !/^[a-z0-9-]+$/.test(version.skillId) ||
      !/^[a-f0-9]{64}$/.test(version.treeHash)
    )
      throw new Error("Identidade de versão inválida.");
    const root = path.join(
      await realpath(location.root),
      ".business-board",
      "skills",
      version.skillId,
      version.treeHash,
    );
    await noLinks(root);
    return root;
  }
  async read(location: Location, version: SkillVersion, resource = "SKILL.md") {
    validateRelativePath(resource);
    const entry = version.files.find((f) => f.path === resource);
    if (!entry)
      throw new Error("Recurso não pertence ao manifesto confirmado da skill.");
    if (treeHash(version.files) !== version.treeHash)
      throw new Error("externally_modified: manifesto da skill foi alterado.");
    const root = await this.versionRoot(location, version);
    const full = path.join(root, "files", ...resource.split("/"));
    await noLinks(full);
    const bytes = await readFile(full);
    if (bytes.length !== entry.size || hash(bytes) !== entry.sha256)
      throw new Error(
        "externally_modified: recurso da skill foi alterado fora do plugin. Importe uma nova versão para revisar.",
      );
    return {
      versionId: version.id,
      resource,
      canonicalSkillRoot: path.join(root, "files"),
      canonicalResourcePath: full,
      encoding: entry.encoding,
      content: bytes.toString(entry.encoding === "utf8" ? "utf8" : "base64"),
      sha256: entry.sha256,
      files: version.files,
    };
  }
  private async stage(
    location: Location,
    material: Material,
  ): Promise<SkillVersion> {
    const version = skillVersionSchema.parse(material.preview.version);
    const managed = await this.managed(location);
    const skillRoot = path.join(managed, version.skillId);
    await mkdir(skillRoot, { recursive: true });
    await noLinks(skillRoot);
    const destination = path.join(skillRoot, version.treeHash);
    try {
      await noLinks(destination);
      for (const file of version.files)
        await this.read(location, version, file.path);
      return version;
    } catch (e) {
      if (!missing(e)) throw e;
    }
    const staging = path.join(managed, `.staging-${randomUUID()}`);
    await mkdir(path.join(staging, "files"), { recursive: true });
    for (const file of version.files) {
      const target = path.join(
        staging,
        "files",
        ...validateRelativePath(file.path).split("/"),
      );
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, material.bytes.get(file.path)!, {
        flag: "wx",
        mode: 0o600,
      });
      const actual = await readFile(target);
      if (actual.length !== file.size || hash(actual) !== file.sha256)
        throw new Error(
          "Falha ao verificar cópia da skill. Staging preservado.",
        );
    }
    await writeFile(
      path.join(staging, "manifest.json"),
      JSON.stringify(version, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    try {
      await rename(staging, destination);
    } catch (e) {
      if (
        !["EEXIST", "ENOTEMPTY", "EPERM"].includes(
          (e as NodeJS.ErrnoException).code || "",
        )
      )
        throw e;
      for (const file of version.files)
        await this.read(location, version, file.path);
    }
    for (const file of version.files)
      await this.read(location, version, file.path);
    return version;
  }
  async import(
    location: Location,
    sourcePath: string,
    expectedTreeHash: string,
    sourceUrl = "",
  ) {
    const material = await this.material(sourcePath, sourceUrl);
    if (material.preview.version.treeHash !== expectedTreeHash)
      throw new Error(
        "CONFLICT: a pasta da skill mudou depois da prévia. Revise a nova prévia antes de confirmar.",
      );
    return this.stage(location, material);
  }
  async previewDerived(
    location: Location,
    parent: SkillVersion,
    skillText: string,
    rationale: string,
  ): Promise<SkillPreview> {
    return (await this.derived(location, parent, skillText, rationale)).preview;
  }
  private async derived(
    location: Location,
    parent: SkillVersion,
    skillText: string,
    rationale: string,
  ): Promise<Material> {
    skillVersionSchema.parse(parent);
    if (
      !rationale.trim() ||
      !skillText.trim() ||
      Buffer.byteLength(skillText) > MAX_FILE
    )
      throw new Error(
        "Informe o texto completo da skill e o motivo do ajuste (máximo 2 MB).",
      );
    const bytes = new Map<string, Buffer>();
    for (const file of parent.files) {
      const read = await this.read(location, parent, file.path);
      bytes.set(
        file.path,
        Buffer.from(read.content, read.encoding === "utf8" ? "utf8" : "base64"),
      );
    }
    const before = bytes.get("SKILL.md")!.toString("utf8");
    if (before === skillText)
      throw new Error(
        "Sem alterações: a versão original foi preservada. Edite o texto antes de criar uma derivada.",
      );
    bytes.set("SKILL.md", Buffer.from(skillText));
    const files = parent.files.map((file) => {
      const content = bytes.get(file.path)!;
      return {
        ...file,
        size: content.length,
        sha256: hash(content),
        encoding: encoding(content),
      };
    });
    const digest = treeHash(files);
    const meta = metadata(skillText, parent.name);
    const version: SkillVersion = {
      ...parent,
      id: `${parent.skillId}@${digest}`,
      treeHash: digest,
      name: meta.name,
      description: meta.description,
      files,
      parentVersionId: parent.id,
      originalVersionId: parent.originalVersionId || parent.id,
      createdAt: new Date().toISOString(),
      rationale,
      diff: textDiff(before, skillText),
    };
    return {
      preview: {
        version,
        skillText,
        warnings: meta.warnings,
        totalBytes: files.reduce((n, f) => n + f.size, 0),
      },
      bytes,
    };
  }
  async derive(
    location: Location,
    parent: SkillVersion,
    skillText: string,
    rationale: string,
    expectedTreeHash: string,
  ) {
    const material = await this.derived(location, parent, skillText, rationale);
    if (material.preview.version.treeHash !== expectedTreeHash)
      throw new Error("CONFLICT: prévia derivada mudou.");
    return this.stage(location, material);
  }
  async export(location: Location, version: SkillVersion) {
    skillVersionSchema.parse(version);
    let target = await this.managed(location);
    for (const segment of ["exports", version.skillId, version.treeHash]) {
      target = path.join(target, segment);
      try {
        await mkdir(target);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
      await noLinks(target);
    }
    for (const file of version.files) {
      const read = await this.read(location, version, file.path);
      const segments = validateRelativePath(file.path).split("/");
      let directory = target;
      for (const segment of segments.slice(0, -1)) {
        directory = path.join(directory, segment);
        try {
          await mkdir(directory);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        }
        await noLinks(directory);
      }
      const full = path.join(directory, segments.at(-1)!);
      try {
        const stat = await lstat(full);
        if (stat.isSymbolicLink() || !stat.isFile())
          throw new Error("Destino de exportação inválido.");
      } catch (e) {
        if (!missing(e)) throw e;
      }
      await writeFile(
        full,
        Buffer.from(read.content, read.encoding === "utf8" ? "utf8" : "base64"),
      );
    }
    return {
      path: target,
      treeHash: version.treeHash,
      fileCount: version.files.length,
    };
  }
}
