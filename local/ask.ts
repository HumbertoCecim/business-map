import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { z } from "zod";
import type { Snapshot } from "../server/store";
import { privateDir } from "./runtime";
import { buildAskPrompt, type AskSkills } from "./ask-context";

const requiredCard = z.object({ id: z.string(), title: z.string(), text: z.string(), firstStep: z.string(), lane: z.enum(["now", "later"]), done: z.boolean(), important: z.boolean(), urgent: z.boolean(), semanticType: z.string().nullable(), sourceIds: z.array(z.string()) }).strict();
const draft = z.object({
  sections: z.array(z.object({ id: z.string(), title: z.string(), questions: z.string(), cards: z.array(requiredCard) }).strict()),
  relations: z.array(z.object({ id: z.string(), fromId: z.string(), toId: z.string(), label: z.string() }).strict()),
  sources: z.array(z.object({ id: z.string(), kind: z.enum(["founder_statement", "github_issue", "log_excerpt", "url", "note"]), label: z.string(), text: z.string(), url: z.string().nullable(), createdAt: z.string() }).strict()),
}).strict();
export const answerSchema = z.object({ answer: z.string().max(30000), suggestions: z.array(z.object({
  kind: z.enum(["insight", "structure", "memory", "card_draft", "map_draft", "skill_adjustment"]),
  title: z.string().max(500), text: z.string().max(30000), rationale: z.string().max(30000),
  targetKind: z.enum(["board", "section", "card"]), targetId: z.string(),
  structure: z.array(z.object({ title: z.string(), questions: z.string() }).strict()),
  cardDraft: z.object({ title: z.string(), text: z.string(), firstStep: z.string() }).strict().nullable(),
  mapDraft: draft.nullable(), skillVersionId: z.string().nullable(), skillText: z.string().nullable(),
}).strict()).max(30) }).strict();
/** Claude's CLI validator supports draft-7; Codex accepts the same schema. */
export const providerAnswerJsonSchema = () => z.toJSONSchema(answerSchema, { target: "draft-7" });
export type AskJob = { id: string; status: "running" | "done" | "error" | "cancelled"; text?: string; error?: string; suggestionIds?: string[] };
export type AskInput = { requestId: string; provider: "codex" | "claude"; model?: string; question: string; targetIds?: string[]; history?: unknown[] };
export type ProviderCommand = { executable: string; prefix: string[] };
export async function providerCommand(provider: "codex" | "claude"): Promise<ProviderCommand | null> {
  const override = process.env[provider === "codex" ? "BUSINESS_CODEX_EXECUTABLE" : "BUSINESS_CLAUDE_EXECUTABLE"];
  if (override) { await access(override); return { executable: override, prefix: [] }; }
  if (provider === "codex") {
    const script = path.join(process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"), "hermes", "node", "node_modules", "@openai", "codex", "bin", "codex.js");
    try {
      await access(script);
      const platform = process.platform, arch = process.arch;
      const triple = platform === "win32" ? `${arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc` : platform === "darwin" ? `${arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin` : `${arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-musl`;
      let vendor = path.join(path.dirname(script), "..", "vendor");
      try { vendor = path.join(path.dirname(createRequire(script).resolve(`@openai/codex-${platform}-${arch}/package.json`)), "vendor"); } catch {}
      const executable = path.join(vendor, triple, "bin", platform === "win32" ? "codex.exe" : "codex");
      await access(executable);
      // Spawn the native provider itself so cancellation owns the actual model
      // process, rather than an npm launcher that could leave a grandchild.
      return { executable, prefix: [] };
    } catch {}
  } else {
    const exe = path.join(homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
    try { await access(exe); return { executable: exe, prefix: [] }; } catch {}
  }
  // PATH lookup without invoking a shell or running a real model.
  const names = process.platform === "win32" ? [`${provider}.exe`] : [provider];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) for (const name of names) {
    try { const executable = path.join(dir, name); await access(executable); return { executable, prefix: [] }; } catch {}
  }
  return null;
}
export class AskManager {
  readonly jobs = new Map<string, AskJob>();
  private requests = new Map<string, { hash: string; id: string }>();
  private children = new Map<string, ChildProcess>();
  private completions = new Map<string, Promise<void>>();
  private committing = new Set<string>();
  constructor(private submitBatch: (candidates: unknown[], snapshot: Snapshot, source: string, requestId: string) => Promise<string[]>, private skillsContext: (snapshot: Snapshot) => Promise<AskSkills>, private resolveProvider = providerCommand) {}
  async providers() { return { providers: await Promise.all((["codex", "claude"] as const).map(async id => ({ id, available: !!await providerCommand(id), identity: "self-declared local CLI provider" }))) }; }
  start(input: AskInput, snapshot: Snapshot) {
    const hash = JSON.stringify(input), prior = this.requests.get(input.requestId);
    if (prior) { if (prior.hash !== hash) throw new Error("requestId already used with different content."); return this.jobs.get(prior.id)!; }
    const job: AskJob = { id: randomUUID(), status: "running" };
    this.jobs.set(job.id, job); this.requests.set(input.requestId, { hash, id: job.id });
    const completion = this.run(job, input, snapshot);
    this.completions.set(job.id, completion);
    void completion.finally(() => this.completions.delete(job.id));
    return job;
  }
  cancel(id: string) {
    const job = this.jobs.get(id); if (!job) throw new Error("Ask job not found.");
    // Once a validated batch reaches the single writer, report its actual result;
    // never label a committed batch as cancelled.
    if (job.status === "running" && !this.committing.has(id)) { job.status = "cancelled"; this.children.get(id)?.kill(); }
    return job;
  }
  async close() { for (const job of this.jobs.values()) if (job.status === "running") this.cancel(job.id); await Promise.allSettled([...this.completions.values()]); }
  private async run(job: AskJob, input: AskInput, snapshot: Snapshot) {
    const cancelled = () => job.status === "cancelled";
    try {
      const skills = await this.skillsContext(snapshot);
      const prompt = buildAskPrompt(input, snapshot.board, skills);
      if (cancelled()) return;
      const command = await this.resolveProvider(input.provider);
      if (!command) throw new Error(`${input.provider} CLI is not installed. Install and sign in with its own CLI first.`);
      const jobDir = path.join(await privateDir(), `ask-${job.id}`);
      await mkdir(jobDir, { mode: 0o700 });
      const schema = JSON.stringify(providerAnswerJsonSchema()), schemaFile = path.join(jobDir, "schema.json"), outputFile = path.join(jobDir, "answer.json");
      await writeFile(schemaFile, schema, { flag: "wx", mode: 0o600 });
      const args = input.provider === "codex"
        ? [...command.prefix, "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "--json", "-c", "features.shell_tool=false", "--output-schema", schemaFile, "--output-last-message", outputFile, ...(input.model ? ["--model", input.model] : []), "-"]
        : [...command.prefix, "-p", "--safe-mode", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--tools", "", "--setting-sources", "", "--settings", '{"disableAllHooks":true}', "--no-session-persistence", "--permission-mode", "plan", "--output-format", "json", "--json-schema", schema, ...(input.model ? ["--model", input.model] : [])];
      if (cancelled()) return;
      const child = spawn(command.executable, args, { cwd: jobDir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } });
      this.children.set(job.id, child);
      let stdout = "", stderr = "", overflow = false;
      child.stdout.on("data", data => { stdout += data; if (stdout.length > 8_000_000) { overflow = true; child.kill(); } });
      child.stderr.on("data", data => { stderr = (stderr + data).slice(-20000); });
      child.stdin.on("error", () => {});
      child.stdin.end(prompt);
      const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
      this.children.delete(job.id);
      if (cancelled()) return;
      if (overflow || code !== 0) throw new Error(overflow ? "Provider output exceeded limit." : `Provider exited ${code}: ${stderr.slice(-4000)}`);
      let raw: unknown;
      if (input.provider === "codex") raw = JSON.parse(await readFile(outputFile, "utf8"));
      else { const envelope = JSON.parse(stdout); if (envelope.is_error) throw new Error(envelope.result || "Claude failed."); raw = envelope.structured_output || JSON.parse(envelope.result); }
      const answer = answerSchema.parse(raw);
      const candidates = answer.suggestions.map(candidate => {
        const { targetKind, targetId, ...rest } = candidate;
        return { ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== null)),
          ...(candidate.mapDraft ? { mapDraft: { ...candidate.mapDraft,
            sections: candidate.mapDraft.sections.map(s => ({ ...s, cards: s.cards.map(c => ({ ...c, ...(c.semanticType === null ? { semanticType: undefined } : {}) })) })),
            sources: candidate.mapDraft.sources.map(s => ({ ...s, ...(s.url === null ? { url: undefined } : {}) })) } } : {}),
          target: { kind: targetKind, id: targetId || snapshot.board.boardId } };
      });
      if (cancelled()) return;
      this.committing.add(job.id);
      job.suggestionIds = await this.submitBatch(candidates, snapshot, `${input.provider}:local-cli:self-declared`, input.requestId);
      job.text = answer.answer; job.status = "done";
    } catch (e) { if (job.status !== "cancelled") { job.status = "error"; job.error = e instanceof Error ? e.message : String(e); } }
    finally { this.children.delete(job.id); this.committing.delete(job.id); }
  }
}
