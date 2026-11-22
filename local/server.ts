import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { BoardStore, type Snapshot } from "../server/store";
import { claimOwner } from "../server/ownership";
import { SkillRepository } from "../server/skills";
import { commandSchema, makeId, suggestionSchema, type Suggestion } from "../shared/model";
import { digest, registerProject, removeRuntime, token, writeRuntime, type Runtime } from "./runtime";
import { queryBoard } from "./query";
import { AskManager, type AskLimits, type providerCommand } from "./ask";
import { handleMcp } from "./mcp";
import { PairingCodes } from "./pairing";
import { controlSocketPath, startControl } from "./control";
import { loadAskSkills } from "./ask-context";

function equal(a: string, b: string) { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
function validateOrigin(req: Pick<IncomingMessage, "headers">, runtime: Runtime) {
  if (req.headers.host !== new URL(runtime.url).host) throw new Error("FORBIDDEN: invalid Host.");
  if (req.headers.origin && req.headers.origin !== runtime.url) throw new Error("FORBIDDEN: invalid Origin.");
}
export function authorize(req: Pick<IncomingMessage, "headers">, runtime: Runtime & { humanToken?: string }, humanSessions = new Set<string>()): "human" | "agent" {
  validateOrigin(req, runtime);
  const auth = req.headers.authorization || "";
  if (runtime.humanToken && equal(auth, `Bearer ${runtime.humanToken}`)) return "human";
  if ([...humanSessions].some(session => equal(auth, `Bearer ${session}`))) return "human";
  if (equal(auth, `Bearer ${runtime.agentToken}`)) return "agent";
  throw new Error("UNAUTHORIZED: valid Bearer token required.");
}
async function body(req: IncomingMessage): Promise<any> {
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { const data = Buffer.from(chunk); bytes += data.length; if (bytes > 5_000_000) throw new Error("Request exceeds 5 MB."); chunks.push(data); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
export const suggestionInputSchema = z.object({ requestId: z.string().min(1).max(160), sourceAgentId: z.string().min(1).max(160), baseRevision: z.number().int().nonnegative(), suggestion: z.record(z.string(), z.unknown()) });
export function prepareSuggestion(input: z.infer<typeof suggestionInputSchema>, snapshot: Snapshot, index = 0): Suggestion {
  // Caller-supplied identity remains provenance, never a capability.
  return suggestionSchema.parse({ title: "", text: "", rationale: "", structure: [], target: { kind: "board", id: snapshot.board.boardId }, ...input.suggestion,
    id: `suggestion-${digest(`${input.sourceAgentId}:${input.requestId}:${index}`).slice(0, 32)}`, requestId: input.requestId, sourceAgentId: input.sourceAgentId,
    baseRevision: input.baseRevision, createdAt: new Date().toISOString(), status: "pending", stale: input.baseRevision !== snapshot.board.revision });
}
export async function startService(options: { root: string; projectId?: string; port?: number; assetsDir?: string; resolveAskProvider?: typeof providerCommand; askLimits?: AskLimits }) {
  const location = await registerProject(options.root, options.projectId), dir = path.join(location.root, ".business-board");
  try { const stat = await lstat(dir); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Invalid board directory."); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  await mkdir(dir, { recursive: true });
  const ownership = await claimOwner(path.join(dir, "service.owner.json"));
  try {
    const fence = await claimOwner(path.join(dir, "writer.owner.json"));
    await fence.release();
  } catch (error) { await ownership.release(); throw error; }
  const store = new BoardStore(ownership.owner.nonce), skills = new SkillRepository(), events = new Set<ServerResponse>();
  let runtime: Runtime & { humanToken: string }, closing = false;
  let control: Awaited<ReturnType<typeof startControl>> | undefined;
  const pairing = new PairingCodes(), humanSessions = new Set<string>();
  let pending = Promise.resolve();
  const publish = (snapshot: Snapshot) => { for (const res of events) res.write(`event: board\ndata: ${JSON.stringify(snapshot)}\n\n`); return snapshot; };
  const enqueue = <T>(operation: () => Promise<T>) => { const next = pending.catch(() => {}).then(operation); pending = next.then(() => {}, () => {}); return next; };
  const requireCurrentSchema = async () => {
    const snapshot = await store.get(location);
    if (snapshot.migrationRequired) throw new Error("MIGRATION_REQUIRED: stop the legacy writer and explicitly confirm migration in the Business Map browser before writing.");
    return snapshot;
  };
  const submit = (candidates: unknown[], captured: Snapshot, source: string, requestId: string) => enqueue(async () => {
    const current = await requireCurrentSchema();
    const proposals = candidates.map((candidate, index) => prepareSuggestion({ requestId, sourceAgentId: source, baseRevision: captured.board.revision, suggestion: candidate as Record<string, unknown> }, current, index));
    // Validate every candidate before the single atomic write; failure writes none.
    if (!proposals.length) return [];
    const snapshot = await store.apply(location, current.board.revision, current.fingerprint, { type: "suggestion.batch", suggestions: proposals }, { id: `agent:${source}:${requestId}`, value: digest(JSON.stringify(candidates)) });
    publish(snapshot); return proposals.map(s => s.id);
  });
  const ask = new AskManager(submit, snapshot => loadAskSkills(snapshot.board, (version, resource) => skills.read(location, version, resource)), options.resolveAskProvider, options.askLimits);
  const json = (res: ServerResponse, value: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(JSON.stringify(value)); };
  const assets = options.assetsDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/build");
  const command = async (data: any) => enqueue(async () => {
    await requireCurrentSchema();
    const parsed = commandSchema.parse(data.command);
    const requestId = z.string().min(1).max(160).parse(data.requestId || data.receipt?.id || makeId("human"));
    const receipt = data.receipt ? { id: z.string().parse(data.receipt.id), value: z.string().parse(data.receipt.value) } : { id: `human:${requestId}`, value: digest(JSON.stringify(parsed)) };
    return publish(await store.apply(location, z.number().int().nonnegative().parse(data.expectedRevision), z.string().parse(data.expectedFingerprint), parsed, receipt));
  });
  const server = createServer((req, res) => { void (async () => {
    if (closing) return json(res, { error: "Service is stopping." }, 503);
    const url = new URL(req.url || "/", runtime.url), endpoint = url.pathname;
    if (!endpoint.startsWith("/api/") && endpoint !== "/mcp") {
      if (req.headers.host !== new URL(runtime.url).host || (req.headers.origin && req.headers.origin !== runtime.url)) throw new Error("FORBIDDEN: invalid Host or Origin.");
      if (req.method !== "GET" && req.method !== "HEAD") throw new Error("Method not allowed.");
      const relative = decodeURIComponent(endpoint).replace(/^\/+/, "") || "index.html";
      if (relative.split(/[\\/]/).some(part => part === "..") || relative.includes("\0")) throw new Error("FORBIDDEN: invalid asset path.");
      let file = path.resolve(assets, relative);
      try { file = await realpath(file); if (!file.startsWith(`${await realpath(assets)}${path.sep}`)) throw new Error("FORBIDDEN: asset outside build."); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; file = path.join(assets, "index.html"); }
      const ext = path.extname(file), mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };
      const content = await readFile(file); res.writeHead(200, { "Content-Type": `${mime[ext] || "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer" }); res.end(req.method === "HEAD" ? undefined : content); return;
    }
    if (["/api/pair/viewer", "/api/pair/paseo"].includes(endpoint) && req.method === "POST") {
      validateOrigin(req, runtime);
      if (req.headers.authorization) throw new Error("FORBIDDEN: pairing requires a one-use code, not an agent capability.");
      const input = await body(req), session = pairing.consume(endpoint.endsWith("/viewer") ? "viewer" : "paseo", input.code);
      humanSessions.add(session); return json(res, { token: session });
    }
    const capability = authorize(req, runtime, humanSessions);
    const human = () => { if (capability !== "human") throw new Error("FORBIDDEN: human capability required."); };
    if (endpoint === "/api/health" && req.method === "GET") return json(res, { ok: true, nonce: runtime.nonce, root: runtime.root, projectId: runtime.projectId, pid: process.pid });
    if (endpoint === "/api/context" && req.method === "GET") return json(res, await store.get(location));
    if (endpoint === "/api/events" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      events.add(res); res.write(`event: board\ndata: ${JSON.stringify(await store.get(location))}\n\n`); req.on("close", () => events.delete(res)); return;
    }
    if (endpoint === "/api/providers" && req.method === "GET") return json(res, await ask.providers());
    if (endpoint.startsWith("/api/ask/")) { human(); const id = endpoint.slice(9); const job = req.method === "DELETE" ? ask.cancel(id) : ask.jobs.get(id); if (!job) return json(res, { error: "Ask job not found." }, 404); return json(res, job); }
    if (endpoint.startsWith("/api/skills/") && req.method === "GET") { const snapshot = await store.get(location), id = decodeURIComponent(endpoint.slice(12)); const version = snapshot.board.skills.find(v => v.id === id); if (!version) throw new Error("Skill version not found."); return json(res, await skills.read(location, version, url.searchParams.get("resource") || "SKILL.md")); }
    if (endpoint === "/mcp") return handleMcp(location.root, req, res, req.method === "POST" ? await body(req) : undefined);
    if (req.method !== "POST") return json(res, { error: "Route not found." }, 404);
    const data = await body(req);
    if (endpoint === "/api/query") return json(res, queryBoard((await store.get(location)).board, data));
    if (endpoint === "/api/export" && (data.save === false || data.save === undefined)) return json(res, await store.export(location, false));
    if (endpoint === "/api/suggestions") { const input = suggestionInputSchema.parse(data); const current = await store.get(location); const captured = { ...current, board: { ...current.board, revision: input.baseRevision } }; return json(res, { suggestionIds: await submit([input.suggestion], captured, input.sourceAgentId, input.requestId), snapshot: await store.get(location) }); }
    human();
    if (endpoint === "/api/pair/paseo-code") return json(res, pairing.issue("paseo"));
    if (endpoint === "/api/migrate") return json(res, await enqueue(async () => {
      const current = await store.get(location);
      if (!current.migrationRequired) return current;
      if (data.legacyWriterStopped !== true) throw new Error("MIGRATION_REQUIRED: explicitly confirm that the legacy writer is stopped.");
      return publish(await store.apply(location, current.board.revision, current.fingerprint, { type: "title", title: current.board.title }));
    }));
    if (endpoint === "/api/command") return json(res, await command(data));
    if (endpoint === "/api/ask") { const input = z.object({ requestId: z.string().min(1).max(160), provider: z.enum(["codex", "claude"]), model: z.string().max(160).optional(), question: z.string().min(1).max(30000), targetIds: z.array(z.string()).max(100).optional(), history: z.array(z.unknown()).max(100).optional() }).parse(data); return json(res, ask.start(input, await requireCurrentSchema()), 202); }
    if (endpoint === "/api/stop") { json(res, { stopping: true }); setImmediate(() => { void stop(); }); return; }
    if (endpoint === "/api/export") { if (data.save) await requireCurrentSchema(); return json(res, await store.export(location, !!data.save)); }
    if (endpoint === "/api/skills/preview") return json(res, await skills.preview(z.string().parse(data.sourcePath), data.sourceUrl || ""));
    if (endpoint.startsWith("/api/skills/")) {
      const snapshot = await store.get(location), version = snapshot.board.skills.find(v => v.id === data.versionId);
      if (endpoint === "/api/skills/derive-preview") { if (!version) throw new Error("Skill version not found."); return json(res, await skills.previewDerived(location, version, data.skillText, data.rationale)); }
      if (endpoint === "/api/skills/export") { await requireCurrentSchema(); if (!version) throw new Error("Skill version not found."); return json(res, await skills.export(location, version)); }
      if (endpoint === "/api/skills/import" || endpoint === "/api/skills/derive") {
        await requireCurrentSchema();
        const imported = endpoint.endsWith("/import") ? await skills.import(location, data.sourcePath, data.expectedTreeHash, data.sourceUrl || "") : version ? await skills.derive(location, version, data.skillText, data.rationale, data.expectedTreeHash) : null;
        if (!imported) throw new Error("Skill version not found.");
        // Stage-only is used by the optional adapter; confirmation still goes through a human command.
        if (data.stageOnly === true) return json(res, imported);
        return json(res, await command({ ...data, command: { type: "skill.register", version: imported, ...(data.sourceSuggestionId ? { sourceSuggestionId: data.sourceSuggestionId } : {}) } }));
      }
    }
    return json(res, { error: "Route not found." }, 404);
  })().catch(error => { if (res.headersSent) { res.end(); return; } const message = error instanceof Error ? error.message : String(error); json(res, { error: message }, message.startsWith("UNAUTHORIZED") ? 401 : message.startsWith("FORBIDDEN") ? 403 : /CONFLICT|requestId|OWNER_BUSY|MIGRATION_REQUIRED|ASK_BUSY/.test(message) ? 409 : 400); }); });
  async function stop() {
    if (closing) return; closing = true;
    await control?.close();
    await ask.close(); await pending.catch(() => {});
    for (const res of events) res.end(); events.clear();
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeIdleConnections(); });
    await removeRuntime(runtime); await ownership.release();
  }
  try {
    await store.get(location); // Invalid canonical board refuses startup without rewriting anything.
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(options.port || 0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Unable to bind local service.");
    runtime = { ...location, pid: process.pid, url: `http://127.0.0.1:${address.port}`, humanToken: token(), agentToken: token(), nonce: ownership.owner.nonce, controlSocket: controlSocketPath(location.root, ownership.owner.nonce) };
    control = await startControl(runtime, action => {
      if (closing) throw new Error("Service is stopping.");
      if (action === "open") return pairing.issue("viewer");
      setImmediate(() => { void stop(); }); return { stopping: true };
    });
    await writeRuntime(runtime);
    return { runtime, stop, store, ask };
  } catch (e) { server.close(); await control?.close(); await ownership.release(); throw e; }
}
