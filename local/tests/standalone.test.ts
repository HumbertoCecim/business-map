import { test, type TestContext } from "node:test";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, lstat, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startService } from "../server";
import { BoardStore } from "../../server/store";
import { claimOwner } from "../../server/ownership";
import { emptyBoard, parseBoard, reduceBoard, type Suggestion } from "../../shared/model";
import { readRuntime } from "../runtime";
import { registerProject, registeredRoot } from "../runtime";
import { AskManager, providerAnswerJsonSchema } from "../ask";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureService, main } from "../cli";
import { pairHumanSession, serviceRequest } from "../../server/service-client";
import { controlRequest } from "../control";
import { PairingCodes } from "../pairing";

async function fixture(t: TestContext) {
  const parent = await mkdtemp(path.join(os.tmpdir(), "business-local-test-")), root = path.join(parent, "project");
  await mkdir(root);
  const prior = process.env.BUSINESS_MAP_HOME; process.env.BUSINESS_MAP_HOME = path.join(parent, "private");
  t.after(async () => { if (prior === undefined) delete process.env.BUSINESS_MAP_HOME; else process.env.BUSINESS_MAP_HOME = prior; assert.equal(path.dirname(parent), path.resolve(os.tmpdir())); assert.ok(path.basename(parent).startsWith("business-local-test-")); await rm(parent, { recursive: true, force: true }); });
  return { root, parent };
}
test("v2 migration is pure, preserves IDs, writes exact immutable backup only on mutation", async t => {
  const { root } = await fixture(t), location = { root, projectId: "test" }, store = new BoardStore();
  const v2 = { ...emptyBoard("identity"), schemaVersion: 2 };
  const raw = `  ${JSON.stringify(v2)}\r\n`, before = structuredClone(v2);
  assert.equal(parseBoard(v2).schemaVersion, 3); assert.deepEqual(v2, before);
  await mkdir(path.join(root, ".business-board")); await writeFile(path.join(root, ".business-board", "board.json"), raw);
  let state = await store.get(location); assert.equal(await readFile(path.join(root, ".business-board", "board.json"), "utf8"), raw);
  state = await store.apply(location, state.board.revision, state.fingerprint, { type: "title", title: "Human" });
  await store.apply(location, state.board.revision, state.fingerprint, { type: "title", title: "Human again" });
  assert.equal(await readFile(path.join(root, ".business-board", "board.v2.backup.json"), "utf8"), raw);
});
test("partial map acceptance preserves human content and prunes excluded links", () => {
  let board = emptyBoard("board"); board.title = "Human title";
  const card = (id: string) => ({ id, title: id, text: "Candidate", firstStep: "Ask", lane: "now" as const, done: true, important: true, urgent: true });
  const proposal: Suggestion = { id: "sug", requestId: "r", kind: "map_draft", title: "Map", text: "", rationale: "", target: { kind: "board", id: "board" }, sourceAgentId: "external:self-declared", baseRevision: 0, createdAt: "now", status: "pending", stale: false, structure: [], mapDraft: { sections: [{ id: "area", title: "Area", questions: "?", cards: [card("a"), card("b")] }], relations: [{ id: "edge", fromId: "a", toId: "b", label: "tests" }], sources: [] } };
  board = reduceBoard(board, { type: "suggestion.submit", suggestion: proposal });
  board = reduceBoard(board, { type: "map.apply", suggestionId: "sug", sectionIds: ["area"], cardIds: ["a"], relationIds: ["edge"], sourceIds: [] });
  assert.equal(board.title, "Human title"); assert.equal(board.suggestions[0].status, "pending"); assert.deepEqual(board.relations || [], []);
  const accepted = board.sections[0].cards[0];
  assert.deepEqual({ lane: accepted.lane, done: accepted.done, important: accepted.important, urgent: accepted.urgent }, { lane: "later", done: false, important: false, urgent: false });
  board = reduceBoard(board, { type: "card.save", sectionId: "area", card: { ...board.sections[0].cards[0], text: "Human edit", important: true } });
  board = reduceBoard(board, { type: "map.apply", suggestionId: "sug", sectionIds: ["area"], cardIds: ["a", "b"], relationIds: ["edge"], sourceIds: [] });
  assert.equal(board.sections[0].cards[0].text, "Human edit"); assert.equal(board.sections[0].cards[0].important, true); assert.equal(board.relations?.length, 1); assert.equal(board.suggestions[0].status, "incorporated");
  const altered = { ...proposal, id: "other", mapDraft: { ...proposal.mapDraft!, sections: [{ ...proposal.mapDraft!.sections[0], title: "Overwrite" }] } };
  board = reduceBoard(board, { type: "suggestion.submit", suggestion: altered });
  assert.throws(() => reduceBoard(board, { type: "map.apply", suggestionId: "other", sectionIds: ["area"], cardIds: [], relationIds: [], sourceIds: [] }), /overwrite/);
});
test("two store instances cannot concurrently write the same snapshot", async t => {
  const { root } = await fixture(t), location = { root, projectId: "p" }, one = new BoardStore(), two = new BoardStore(), state = await one.get(location);
  const results = await Promise.allSettled([one.apply(location, 0, state.fingerprint, { type: "title", title: "A" }), two.apply(location, 0, state.fingerprint, { type: "title", title: "B" })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((await one.get(location)).board.revision, 1);
});
test("ownership fails closed for live/foreign owners and recovers only same-host dead PID", async t => {
  const { root } = await fixture(t), file = path.join(root, "owner");
  const first = await claimOwner(file); await assert.rejects(claimOwner(file), /OWNER_BUSY/); await first.release();
  await writeFile(file, JSON.stringify({ host: "another-host", pid: 999999999, nonce: "old" })); await assert.rejects(claimOwner(file), /OWNER_BUSY/);
  await writeFile(file, JSON.stringify({ host: os.hostname(), pid: 999999999, nonce: "dead" })); const recovered = await claimOwner(file); await recovered.release();
});
test("service startup fences an already active direct writer", async t => {
  const { root } = await fixture(t), dir = path.join(root, ".business-board"); await mkdir(dir);
  const writer = await claimOwner(path.join(dir, "writer.owner.json"));
  await assert.rejects(startService({ root }), /OWNER_BUSY/); await writer.release();
  const service = await startService({ root }); await service.stop();
});
test("service auth, single owner, idempotence, agent-only proposals, MCP and ordered restart", async t => {
  const { root } = await fixture(t); const service = await startService({ root }); let stopped = false;
  t.after(async () => { if (!stopped) await service.stop(); });
  const { runtime } = service;
  const request = (endpoint: string, input?: unknown, token = runtime.humanToken, extra: Record<string, string> = {}) => fetch(`${runtime.url}${endpoint}`, { method: input === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  assert.equal((await fetch(`${runtime.url}/api/context`)).status, 401);
  assert.equal((await request("/api/context", undefined, runtime.agentToken, { Origin: "https://evil.example" })).status, 403);
  const badHost = await new Promise<number | undefined>((resolve, reject) => { const req = httpRequest(`${runtime.url}/api/context`, { headers: { Host: "evil.example", Authorization: `Bearer ${runtime.agentToken}` } }, res => { res.resume(); resolve(res.statusCode); }); req.on("error", reject); req.end(); });
  assert.equal(badHost, 403);
  await assert.rejects(startService({ root }), /OWNER_BUSY/);
  const context = await (await request("/api/context")).json() as any;
  const command = { requestId: "human-1", expectedRevision: 0, expectedFingerprint: context.fingerprint, command: { type: "title", title: "Human text" } };
  assert.equal((await request("/api/command", command, runtime.agentToken)).status, 403);
  assert.equal((await request("/api/command", command)).status, 200); assert.equal((await request("/api/command", command)).status, 200);
  assert.equal((await request("/api/command", { ...command, command: { type: "title", title: "different" } })).status, 409);
  const loc = { root, projectId: runtime.projectId }, external = new BoardStore(), state = await external.get(loc);
  await assert.rejects(external.apply(loc, state.board.revision, state.fingerprint, { type: "title", title: "Forbidden second writer" }), /OWNER_BUSY/);
  const proposal = { requestId: "external-1", sourceAgentId: "autodeclared", baseRevision: 0, suggestion: { kind: "insight", title: "Proposal", text: "Pending", status: "incorporated" } };
  const submitted = await (await request("/api/suggestions", proposal, runtime.agentToken)).json() as any;
  assert.equal(submitted.snapshot.board.title, "Human text"); assert.equal(submitted.snapshot.board.suggestions[0].status, "pending"); assert.equal(submitted.snapshot.board.suggestions[0].stale, true);
  assert.equal((await request("/api/suggestions", proposal, runtime.agentToken)).status, 200);
  const client = new Client({ name: "test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${runtime.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${runtime.agentToken}` } } });
  await client.connect(transport); const tools = await client.listTools(); assert.equal(tools.tools.length, 4);
  for (const tool of tools.tools) assert.deepEqual(tool.annotations, { readOnlyHint: tool.name !== "business_submit_suggestion", idempotentHint: true, destructiveHint: false, openWorldHint: false });
  assert.ok(client.getInstructions()?.includes("business_get_context first"));
  const result = await client.callTool({ name: "business_get_context", arguments: {} }); assert.ok(JSON.stringify(result).includes("Human text"));
  await client.close();
  const saved = await readFile(path.join(root, ".business-board", "board.json"), "utf8"); assert.ok(!saved.includes(runtime.humanToken)); assert.ok(!saved.includes(runtime.agentToken));
  await service.stop(); stopped = true; assert.equal(await readRuntime(root), null);
  const restarted = await startService({ root }); assert.equal((await restarted.store.get(loc)).board.title, "Human text"); await restarted.stop();
});
test("invalid board refuses startup and preserves every canonical byte", async t => {
  const { root } = await fixture(t), dir = path.join(root, ".business-board"); await mkdir(dir); await writeFile(path.join(dir, "board.json"), "{invalid");
  await assert.rejects(startService({ root }), /inválido|incompatível/); assert.equal(await readFile(path.join(dir, "board.json"), "utf8"), "{invalid");
});
test("Git worktrees resolve the explicitly registered canonical project instead of creating another board", async t => {
  const { root, parent } = await fixture(t), git = promisify(execFile), worktree = path.join(parent, "worktree");
  await git("git", ["init", root], { windowsHide: true });
  await git("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture"], { windowsHide: true });
  await git("git", ["-C", root, "worktree", "add", "--detach", worktree], { windowsHide: true });
  const first = await registerProject(root, "explicit-project");
  assert.deepEqual(await registerProject(worktree), first); assert.equal(await registeredRoot(worktree), first.root);
  const service = await startService({ root: worktree }); assert.equal(service.runtime.root, first.root); assert.equal((await readRuntime(worktree))?.nonce, service.runtime.nonce); await service.stop();
});
test("Ask validates complete output, deduplicates requests and cancels the exact child without submitting partial output", async t => {
  const providerSchema = providerAnswerJsonSchema();
  assert.equal(providerSchema.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(providerSchema.additionalProperties, false);
  const { root, parent } = await fixture(t), script = path.join(parent, "fake-provider.cjs");
  await writeFile(script, `const fs=require('node:fs');let text='';process.stdin.on('data',x=>text+=x);process.stdin.on('end',()=>{const output=process.argv[process.argv.indexOf('--output-last-message')+1];if(text.includes('SLOW_TEST'))setTimeout(()=>fs.writeFileSync(output,'{}'),30000);else if(text.includes('BAD_TEST'))fs.writeFileSync(output,'{"answer":"partial","suggestions":[{}]}');else fs.writeFileSync(output,JSON.stringify({answer:'Validated response',suggestions:[]}));});`);
  let writes = 0;
  const manager = new AskManager(async () => { writes++; return []; }, async () => ({ versions: [], omissions: [] }), async () => ({ executable: process.execPath, prefix: [script] }));
  const snapshot = await new BoardStore().get({ root, projectId: "test" });
  const input = { requestId: "one", provider: "codex" as const, question: "Explain" };
  const job = manager.start(input, snapshot); assert.equal(manager.start(input, snapshot).id, job.id);
  assert.throws(() => manager.start({ ...input, question: "Different" }, snapshot), /requestId/);
  const wait = async (id: string) => { for (let i = 0; i < 500; i++) { if (manager.jobs.get(id)?.status !== "running") return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error("Fake provider timed out."); };
  await wait(job.id); assert.equal(job.status, "done"); assert.equal(job.text, "Validated response"); assert.equal(writes, 1);
  const bad = manager.start({ ...input, requestId: "bad", question: "BAD_TEST" }, snapshot); await wait(bad.id); assert.equal(bad.status, "error"); assert.equal(writes, 1);
  const slow = manager.start({ ...input, requestId: "slow", question: "SLOW_TEST" }, snapshot); await new Promise(resolve => setTimeout(resolve, 150)); manager.cancel(slow.id); await manager.close(); assert.equal(slow.status, "cancelled"); assert.equal(writes, 1);
});
test("concurrent CLI launches reuse one healthy detached writer and stop it in order", async t => {
  const { root } = await fixture(t);
  const [one, two] = await Promise.all([ensureService(root), ensureService(root)]);
  assert.equal(one.nonce, two.nonce); assert.equal(one.pid, two.pid);
  await controlRequest(one, "stop");
  for (let i = 0; i < 200; i++) { if (!await readRuntime(root)) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("Detached service failed to stop.");
});
test("agent-readable discovery cannot grant viewer/Paseo authority; explicit control issues one-use browser codes", async t => {
  const { root, parent } = await fixture(t), service = await startService({ root });
  try {
    const runtime = (await readRuntime(root))!, base = service.runtime;
    assert.equal("humanToken" in runtime, false);
    const request = (endpoint: string, input: unknown, credential?: string) => fetch(`${base.url}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, body: JSON.stringify(input) });
    const state = await service.store.get({ root, projectId: runtime.projectId });
    const command = { expectedRevision: state.board.revision, expectedFingerprint: state.fingerprint, requestId: "paired-human", command: { type: "title", title: "Confirmed viewer text" } };
    const strings: string[] = [];
    const values = (value: unknown) => { if (typeof value === "string") strings.push(value); else if (value && typeof value === "object") Object.values(value).forEach(values); };
    for (const name of await readdir(path.join(parent, "private"))) {
      const file = path.join(parent, "private", name); if (!(await lstat(file)).isFile()) continue;
      const text = await readFile(file, "utf8"); assert.ok(!text.includes(base.humanToken)); values(JSON.parse(text));
    }
    for (const credential of strings) assert.notEqual((await request("/api/command", command, credential)).status, 200);
    await assert.rejects(serviceRequest(root, "/api/command", command, "human"), /PAIRING_REQUIRED/);
    const first = await controlRequest(runtime, "open"), second = await controlRequest(runtime, "open"); assert.notEqual(first.code, second.code);
    assert.equal((await request("/api/pair/viewer", { code: first.code }, runtime.agentToken)).status, 403);
    const paired = await request("/api/pair/viewer", { code: first.code }); assert.equal(paired.status, 200); const browser = await paired.json() as { token: string };
    assert.equal((await request("/api/pair/viewer", { code: first.code })).status, 403);
    assert.equal((await request("/api/pair/viewer", { code: second.code })).status, 200);
    assert.equal((await request("/api/pair/paseo-code", {}, runtime.agentToken)).status, 403);
    const paseoCode = await (await request("/api/pair/paseo-code", {}, browser.token)).json() as { code: string };
    assert.equal((await request("/api/pair/viewer", { code: paseoCode.code })).status, 403);
    await pairHumanSession(root, paseoCode.code);
    assert.equal((await serviceRequest(root, "/api/command", command, "human")).board.title, "Confirmed viewer text");
    assert.equal((await request("/api/pair/paseo", { code: paseoCode.code })).status, 403);
    assert.equal((await readRuntime(root))?.nonce, runtime.nonce);
    for (const name of await readdir(path.join(parent, "private"))) { const file = path.join(parent, "private", name); if (!(await lstat(file)).isFile()) continue; const text = await readFile(file, "utf8"); for (const secret of [base.humanToken, browser.token, first.code, second.code, paseoCode.code]) assert.ok(!text.includes(secret)); }
  } finally { await service.stop(); }
});
test("pairing codes expire, are scoped, are one use and limit failed attempts", () => {
  let now = 1000; const pairs = new PairingCodes(() => now), viewer = pairs.issue("viewer"), paseo = pairs.issue("paseo");
  now += 60_000; assert.throws(() => pairs.consume("viewer", viewer.code), /expired/);
  assert.throws(() => pairs.consume("viewer", paseo.code), /invalid/); assert.ok(pairs.consume("paseo", paseo.code)); assert.throws(() => pairs.consume("paseo", paseo.code), /already used/);
  for (let i = 0; i < 20; i++) assert.throws(() => pairs.consume("viewer", "bad"));
  assert.throws(() => pairs.consume("viewer", "bad"), /attempt limit/);
});
test("legacy API writes require explicit stopped-writer migration confirmation and preserve immutable backup", async t => {
  const { root } = await fixture(t), dir = path.join(root, ".business-board"); await mkdir(dir);
  const raw = `  ${JSON.stringify({ ...emptyBoard("legacy-identity"), schemaVersion: 2 })}\r\n`; await writeFile(path.join(dir, "board.json"), raw);
  const service = await startService({ root });
  try {
    const runtime = service.runtime, req = (endpoint: string, data: unknown, credential = runtime.humanToken) => fetch(`${runtime.url}${endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const state = await service.store.get({ root, projectId: runtime.projectId }); assert.equal(state.migrationRequired, true);
    const command = { expectedRevision: state.board.revision, expectedFingerprint: state.fingerprint, requestId: "blocked", command: { type: "title", title: "Blocked before confirm" } };
    assert.equal((await req("/api/command", command)).status, 409);
    assert.equal((await req("/api/suggestions", { requestId: "blocked-agent", sourceAgentId: "self-declared", baseRevision: 0, suggestion: { kind: "insight", title: "Blocked" } }, runtime.agentToken)).status, 409);
    assert.equal((await req("/api/ask", { requestId: "blocked-ask", provider: "codex", question: "Do not invoke a provider" })).status, 409); assert.equal(service.ask.jobs.size, 0);
    assert.equal((await req("/api/migrate", { legacyWriterStopped: true }, runtime.agentToken)).status, 403);
    assert.equal((await req("/api/migrate", { legacyWriterStopped: false })).status, 409);
    assert.equal(await readFile(path.join(dir, "board.json"), "utf8"), raw);
    await assert.rejects(readFile(path.join(dir, "board.v2.backup.json")), /ENOENT/);
    const migrated = await (await req("/api/migrate", { legacyWriterStopped: true })).json() as any; assert.equal(migrated.board.schemaVersion, 3); assert.equal(migrated.board.boardId, "legacy-identity"); assert.ok(!migrated.migrationRequired);
    assert.equal(await readFile(path.join(dir, "board.v2.backup.json"), "utf8"), raw);
    const again = await (await req("/api/migrate", { legacyWriterStopped: true })).json() as any; assert.equal(again.board.revision, migrated.board.revision);
    assert.equal(await readFile(path.join(dir, "board.v2.backup.json"), "utf8"), raw);
  } finally { await service.stop(); }
});
test("first CLI registration requires an explicit root", async t => {
  const { root, parent } = await fixture(t), prior = process.cwd(); process.chdir(root);
  try { await assert.rejects(main(["open", "--no-browser"]), /explicit business root/); await assert.rejects(lstat(path.join(root, ".business-board")), /ENOENT/); await assert.rejects(lstat(path.join(parent, "private")), /ENOENT/); }
  finally { process.chdir(prior); }
});
