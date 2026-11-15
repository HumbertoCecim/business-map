import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PluginRpcContract, RpcInput } from "@getpaseo/plugin";
import contribute from "../../index.server";
import { conversationDeliverRpc, conversationStartRpc } from "../../shared/chat-entry";
import { emptyBoard, type Board } from "../../shared/model";
import type { Snapshot } from "../store";
import { startChatPills } from "../../client/chat-pills";
import { boardObservations } from "../../client/board-observations";
import { projectScope } from "../../shared/project-state";
import { adapterServices } from "./adapter-service.fixture";

type StartInput = RpcInput<typeof conversationStartRpc>;
type Handler = (input: unknown, context: { paseo: PaseoApi }) => Promise<unknown>;
type OpenHook = (event: { request: { agentId: string; workspaceId: string; purpose: string; tools: unknown[] } }, context: { paseo: PaseoApi }) => Promise<{ tools: { name: string }[] } | undefined>;
type AgentState = {
  workspaceId: string;
  archivedAt: string | null;
  status: string;
  activeTurn: object | null;
  reloads: number;
  refreshes: number;
  sends: string[];
  reloadFailure?: Error;
  sendFailure?: Error;
  beforeReload?: () => Promise<void>;
  beforeRefresh?: () => Promise<void>;
  beforeSend?: () => Promise<void>;
};
async function exists(file: string) {
  try { await access(file); return true; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; }
}
async function harness(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "business-chat-independent-"));
  const tempParent = path.resolve(os.tmpdir());
  assert.equal(path.dirname(path.resolve(root)), tempParent);
  let stopService = async () => {};
  t.after(async () => {
    await stopService();
    assert.equal(path.dirname(path.resolve(root)), tempParent);
    assert.ok(path.basename(root).startsWith("business-chat-independent-"));
    await rm(root, { recursive: true, force: true });
  });
  const main = path.join(root, "registered-project"), worktree = path.join(root, "worktree"), other = path.join(root, "other-project");
  await Promise.all([main, worktree, other].map(p => mkdir(p)));
  const service = await adapterServices([main, other]);
  stopService = service.close;
  const agents = new Map<string, AgentState>([
    ["chosen", agent("main")], ["second", agent("main")], ["worktree-agent", agent("worktree")], ["foreign-agent", agent("other")],
  ]);
  function agent(workspaceId: string): AgentState {
    return { workspaceId, archivedAt: null, status: "idle", activeTurn: null, reloads: 0, refreshes: 0, sends: [] };
  }
  const refs = new Map<string, object>();
  const paseo = {
    workspaces: { ref: (id: string) => ({ refresh: async () => id === "missing" ? null : ({ projectId: id === "other" ? "other-project" : "project", workspaceDirectory: id === "worktree" ? worktree : id === "other" ? other : main }) }) },
    projects: { list: async () => ({ projects: [{ projectId: "project", projectRootPath: main }, { projectId: "other-project", projectRootPath: other }] }) },
    agents: { ref: (id: string) => {
      if (!refs.has(id)) refs.set(id, {
        refresh: async () => { const a = agents.get(id); if (!a) return null; a.refreshes++; await a.beforeRefresh?.(); return { agent: { id, workspaceId: a.workspaceId, archivedAt: a.archivedAt, status: a.status } }; },
        get status() { return agents.get(id)?.status; },
        get activeTurn() { return agents.get(id)?.activeTurn; },
        reload: async () => { const a = agents.get(id)!; a.reloads++; await a.beforeReload?.(); if (a.reloadFailure) throw a.reloadFailure; },
        send: async (message: string) => { const a = agents.get(id)!; a.sends.push(message); await a.beforeSend?.(); if (a.sendFailure) throw a.sendFailure; return { messageId: `message-${a.sends.length}` }; },
      });
      return refs.get(id);
    } },
  } as unknown as PaseoApi;
  const handlers = new Map<string, { contract: PluginRpcContract; handler: Handler }>();
  const hooks = new Map<string, OpenHook>();
  function register() {
    handlers.clear();
    hooks.clear();
    const server = { handle: (contract: PluginRpcContract, handler: Handler) => handlers.set(contract.name, { contract, handler }), addHook: (name: string, hook: OpenHook) => { hooks.set(name, hook); return () => hooks.delete(name); } } as unknown as PluginServerContext;
    contribute(server);
  }
  register();
  async function rpc(name: string, input: unknown) {
    const registration = handlers.get(name);
    assert.ok(registration, `Expected RPC ${name} to be registered`);
    const result = await registration.handler(registration.contract.input.parse(input), { paseo });
    return registration.contract.output.parse(result);
  }
  const get = (workspaceId = "main") => rpc("board.get", { workspaceId }) as Promise<Snapshot>;
  const start = (input: StartInput) => rpc("conversation.start", input) as Promise<Snapshot>;
  const deliver = (input: RpcInput<typeof conversationDeliverRpc>) => rpc("conversation.deliver", input) as Promise<{ snapshot: Snapshot; status: "sent" | "already_sent" | "waiting" | "uncertain"; message: string; warning?: string }>;
  async function input(overrides: Partial<StartInput> = {}): Promise<StartInput> {
    const current = await get(overrides.workspaceId || "main");
    return { workspaceId: "main", expectedRevision: current.board.revision, expectedFingerprint: current.fingerprint, requestId: "start-request", agentId: "chosen", title: "Business hypothesis", objective: "Validate demand with real interviews", skillVersionIds: [], ...overrides };
  }
  const file = path.join(main, ".business-board", "board.json");
  async function seed(board: Board) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(board, null, 2) + "\n");
  }
  async function openAgent(agentId = "chosen", workspaceId = agents.get(agentId)!.workspaceId) {
    const hook = hooks.get("agent.open.before");
    assert.ok(hook);
    return hook({ request: { agentId, workspaceId, purpose: "interactive", tools: [] } }, { paseo });
  }
  return { root, main, worktree, other, agents, file, get, start, deliver, input, rpc, seed, openAgent, restart: register };
}
function humanBoard(): Board {
  const b = emptyBoard("existing-business-board");
  b.title = "Existing business";
  b.sections = [{ id: "area", title: "Human area", questions: "Whom do we serve?", cards: [{ id: "card", title: "Existing card", text: "Human reasoning must survive onboarding", firstStep: "Interview customers", lane: "later", done: false, important: true, urgent: false }] }];
  b.focus = { visible: true, limit: 1, cardIds: ["card"] };
  b.whereStopped = "Human continuation";
  b.agent = { id: null, skills: ["Legacy reference"], endOfConversation: true };
  b.memories = [{ id: "decision", kind: "decision", text: "Confirmed human decision", rationale: "Interview evidence", target: { kind: "card", id: "card" }, sourceSuggestionId: null, createdAt: "2026-11-14" }];
  b.receipts = { "old-agent:old-request": "old-content-hash" };
  b.suggestions = [{ id: "candidate", requestId: "old-candidate", kind: "insight", title: "Review later", text: "Pending agent proposal", rationale: "Reason", target: { kind: "board", id: b.boardId }, structure: [], sourceAgentId: "old-agent", baseRevision: 0, createdAt: "2026-11-14", status: "pending", stale: false }];
  return b;
}

test("chat Start commits agent, business name and logical session in one board revision without sending", async (t) => {
  const h = await harness(t);
  const before = await h.get();
  const result = await h.start(await h.input());
  assert.equal(result.board.revision, before.board.revision + 1);
  assert.equal(result.board.title, "Business hypothesis");
  assert.equal(result.board.agent.id, "chosen");
  assert.equal(result.board.sessions.length, 1);
  assert.equal(result.board.currentSessionId, result.board.sessions[0].id);
  assert.equal(result.board.sessions[0].agentId, "chosen");
  assert.equal(result.board.sessions[0].objective, "Validate demand with real interviews");
  assert.equal(result.board.sessions[0].status, "active");
  assert.deepEqual(result.board.sessions[0].skillVersionIds, []);
  assert.equal(h.agents.get("chosen")!.reloads, 0);
  assert.deepEqual(h.agents.get("chosen")!.sends, []);
});

test("chat Start preserves every existing human card, decision, focus and pending proposal", async (t) => {
  const h = await harness(t);
  const existing = humanBoard();
  await h.seed(existing);
  const result = await h.start(await h.input({ title: existing.title }));
  for (const field of ["boardId", "title", "sections", "focus", "whereStopped", "memories", "suggestions"] as const) assert.deepEqual(result.board[field], existing[field], field);
  assert.equal(result.board.receipts["old-agent:old-request"], "old-content-hash");
  assert.equal(result.board.agent.endOfConversation, true);
  assert.deepEqual(result.board.agent.skills, existing.agent.skills);
});

test("chat Start rejects unavailable skills and foreign agents before creating or partially binding a board", async (t) => {
  const h = await harness(t);
  const before = await h.get();
  await assert.rejects(h.start(await h.input({ skillVersionIds: ["not-imported"] })));
  await assert.rejects(h.start(await h.input({ agentId: "foreign-agent" })));
  await assert.rejects(h.start(await h.input({ agentId: "missing-agent" })));
  assert.deepEqual(await h.get(), before);
  assert.equal(await exists(h.file), false);
  for (const agent of h.agents.values()) { assert.equal(agent.reloads, 0); assert.deepEqual(agent.sends, []); }
});

test("chat Start retry with an old revision survives a fresh server and does not create another session", async (t) => {
  const h = await harness(t);
  const input = await h.input();
  const first = await h.start(input);
  h.restart();
  const retried = await h.start(input);
  assert.deepEqual(retried, first);
  assert.equal(retried.board.sessions.length, 1);
  assert.equal(retried.board.revision, 1);
});

test("a reused Start request cannot silently replace the person's objective", async (t) => {
  const h = await harness(t);
  const input = await h.input();
  await h.start(input);
  const before = await readFile(h.file);
  await assert.rejects(h.start({ ...input, objective: "Different objective" }));
  assert.deepEqual(await readFile(h.file), before);
});

test("concurrent copies of one Start request produce one logical session and one commit", async (t) => {
  const h = await harness(t);
  const input = await h.input();
  const [first, second] = await Promise.all([h.start(input), h.start(input)]);
  assert.deepEqual(first, second);
  assert.equal((await h.get()).board.sessions.length, 1);
  assert.equal((await h.get()).board.revision, 1);
});

test("a second agent cannot take over an existing active logical session", async (t) => {
  const h = await harness(t);
  const first = await h.start(await h.input());
  const before = await readFile(h.file);
  await assert.rejects(h.start(await h.input({ requestId: "second-start", agentId: "second", title: "Unwanted replacement" })));
  assert.deepEqual(await readFile(h.file), before);
  assert.equal((await h.get()).board.currentSessionId, first.board.currentSessionId);
  assert.equal((await h.get()).board.agent.id, "chosen");
  assert.deepEqual(h.agents.get("second")!.sends, []);
});

test("a same-revision external edit makes Start fail without overwriting the new human text", async (t) => {
  const h = await harness(t);
  await h.seed(humanBoard());
  const input = await h.input();
  const external = { ...(await h.get()).board, whereStopped: "Changed in external editor" };
  await writeFile(h.file, JSON.stringify(external));
  const raw = await readFile(h.file);
  await assert.rejects(h.start(input));
  assert.deepEqual(await readFile(h.file), raw);
  assert.equal((await h.get()).board.currentSessionId, null);
});

test("Start from a worktree uses the registered project board and isolates other projects", async (t) => {
  const h = await harness(t);
  const result = await h.start(await h.input({ workspaceId: "worktree", agentId: "worktree-agent" }));
  assert.deepEqual(await h.get("main"), result);
  assert.deepEqual(await h.get("worktree"), result);
  assert.equal(result.root, h.main);
  assert.equal(await exists(path.join(h.worktree, ".business-board")), false);
  assert.equal((await h.get("other")).board.currentSessionId, null);
  // The other service owns its runtime gate, but has not created business content.
  assert.equal(await exists(path.join(h.other, ".business-board", "board.json")), false);
});

test("a busy chat refuses Start without writing a board but an already committed retry stays idempotent", async (t) => {
  const h = await harness(t);
  const a = h.agents.get("chosen")!;
  const input = await h.input();
  a.status = "running";
  a.activeTurn = { id: "real-turn" };
  await assert.rejects(h.start(input));
  assert.equal(await exists(h.file), false);
  assert.equal((await h.get()).board.agent.id, null);
  a.status = "idle";
  a.activeTurn = null;
  const committed = await h.start(input);
  a.status = "running";
  a.activeTurn = { id: "later-turn" };
  assert.deepEqual(await h.start(input), committed);
  assert.equal(a.reloads, 0);
  assert.deepEqual(a.sends, []);
});

test("delivery waits for a busy agent and later sends one initial message without another session", async (t) => {
  const h = await harness(t);
  const started = await h.start(await h.input());
  const input = { workspaceId: "main", agentId: "chosen", sessionId: started.board.currentSessionId! };
  const a = h.agents.get("chosen")!;
  a.status = "running";
  a.activeTurn = { id: "current-turn" };
  const waiting = await h.deliver(input);
  assert.equal(waiting.status, "waiting");
  assert.deepEqual(waiting.snapshot, started);
  assert.equal(a.reloads, 0);
  assert.equal(a.sends.length, 0);
  a.status = "idle";
  a.activeTurn = null;
  const sent = await h.deliver(input);
  assert.equal(sent.status, "sent");
  assert.equal(sent.snapshot.board.sessions.length, 1);
  assert.equal(sent.snapshot.board.currentSessionId, input.sessionId);
  assert.equal(a.reloads, 1);
  assert.equal(a.sends.length, 1);
  assert.ok(a.sends[0].includes(started.board.sessions[0].objective));
  h.restart();
  assert.equal((await h.deliver(input)).status, "already_sent");
  assert.equal(a.sends.length, 1);
});

test("concurrent delivery clicks are serialized and send the kickoff only once", async (t) => {
  const h = await harness(t);
  const started = await h.start(await h.input());
  const input = { workspaceId: "main", agentId: "chosen", sessionId: started.board.currentSessionId! };
  const [a, b] = await Promise.all([h.deliver(input), h.deliver(input)]);
  assert.deepEqual([a.status, b.status].sort(), ["already_sent", "sent"]);
  assert.equal(h.agents.get("chosen")!.sends.length, 1);
  assert.equal((await h.get()).board.sessions.length, 1);
});

test("a failed send preserves the session and requires explicit human confirmation before retry", async (t) => {
  const h = await harness(t);
  const started = await h.start(await h.input());
  const input = { workspaceId: "main", agentId: "chosen", sessionId: started.board.currentSessionId! };
  const a = h.agents.get("chosen")!;
  a.sendFailure = new Error("Transport acknowledgement lost");
  const failed = await h.deliver(input);
  assert.equal(failed.status, "uncertain");
  assert.equal(failed.snapshot.board.currentSessionId, input.sessionId);
  assert.equal(failed.snapshot.board.sessions.length, 1);
  assert.equal(a.sends.length, 1);
  delete a.sendFailure;
  h.restart();
  assert.equal((await h.deliver(input)).status, "uncertain");
  assert.equal(a.sends.length, 1);
  assert.equal((await h.deliver({ ...input, retryConfirmed: true })).status, "sent");
  assert.equal(a.sends.length, 2);
  assert.equal(a.sends[0], a.sends[1]);
  assert.equal((await h.get()).board.sessions.length, 1);
});

test("reload failure leaves kickoff unattempted and safe to retry without creating another session", async (t) => {
  const h = await harness(t);
  const started = await h.start(await h.input());
  const input = { workspaceId: "main", agentId: "chosen", sessionId: started.board.currentSessionId! };
  const a = h.agents.get("chosen")!;
  a.reloadFailure = new Error("Provider refused reload");
  await assert.rejects(h.deliver(input));
  assert.deepEqual(await h.get(), started);
  assert.deepEqual(a.sends, []);
  delete a.reloadFailure;
  assert.equal((await h.deliver(input)).status, "sent");
  assert.equal(a.sends.length, 1);
});

test("delivery rejects the wrong conversation or project without touching the real session", async (t) => {
  const h = await harness(t);
  const started = await h.start(await h.input());
  const sessionId = started.board.currentSessionId!;
  await assert.rejects(h.deliver({ workspaceId: "main", agentId: "second", sessionId }));
  await assert.rejects(h.deliver({ workspaceId: "other", agentId: "chosen", sessionId }));
  await assert.rejects(h.deliver({ workspaceId: "missing", agentId: "chosen", sessionId }));
  assert.deepEqual(await h.get(), started);
  for (const a of h.agents.values()) { assert.equal(a.reloads, 0); assert.deepEqual(a.sends, []); }
});

test("an agent becoming busy during reload receives no kickoff and keeps the saved session", async (t) => {
  const h = await harness(t);
  const started = await h.start(await h.input());
  const a = h.agents.get("chosen")!;
  a.beforeReload = async () => { a.status = "running"; a.activeTurn = { id: "external-turn" }; };
  const result = await h.deliver({ workspaceId: "main", agentId: "chosen", sessionId: started.board.currentSessionId! });
  assert.equal(result.status, "waiting");
  assert.deepEqual(await h.get(), started);
  assert.deepEqual(a.sends, []);
});

test("a human closing the logical session during reload prevents the initial message", async (t) => {
  const h = await harness(t);
  const started = await h.start(await h.input());
  const sessionId = started.board.currentSessionId!;
  const a = h.agents.get("chosen")!;
  a.beforeReload = async () => {
    const current = await h.get();
    await h.rpc("board.apply", { workspaceId: "main", expectedRevision: current.board.revision, expectedFingerprint: current.fingerprint, command: { type: "session.closing", sessionId } });
  };
  await assert.rejects(h.deliver({ workspaceId: "main", agentId: "chosen", sessionId }));
  assert.deepEqual(a.sends, []);
  assert.equal((await h.get()).board.sessions[0].status, "closing");
});

const unsupportedHistory = "thread/items/list is not supported yet";
async function fallbackHarness(t: TestContext) {
  const h = await harness(t);
  const started = await h.start(await h.input());
  const a = h.agents.get("chosen")!;
  a.reloadFailure = new Error(unsupportedHistory);
  const input = { workspaceId: "main", agentId: "chosen", sessionId: started.board.currentSessionId! };
  return { h, a, input, started };
}

test("the known history hydration failure may send only after tools were attached in that same reload", async (t) => {
  const { h, a, input } = await fallbackHarness(t);
  a.beforeReload = async () => {
    const opened = await h.openAgent();
    assert.deepEqual(opened?.tools.map(tool => tool.name), ["business_get_context", "business_submit_suggestion", "business_read_skill"]);
  };
  const result = await h.deliver(input);
  assert.equal(result.status, "sent");
  assert.equal(a.sends.length, 1);
  assert.equal(a.reloads, 1);
  assert.match(result.warning || result.message, /hist[oó]rico|sincroniza|aviso/i, "The person must see that provider history synchronization failed");
  assert.equal((await h.deliver(input)).status, "already_sent");
  assert.equal(a.sends.length, 1);
});

test("the known history error without a new tool attachment never authorizes a send", async (t) => {
  const { h, a, input, started } = await fallbackHarness(t);
  await assert.rejects(h.deliver(input));
  assert.equal(a.sends.length, 0);
  assert.deepEqual(await h.get(), started);
});

test("a tool attachment from an older reload is not proof for the current failed attempt", async (t) => {
  const { h, a, input, started } = await fallbackHarness(t);
  const oldHook = await h.openAgent();
  assert.equal(oldHook?.tools.length, 3);
  await assert.rejects(h.deliver(input));
  assert.equal(a.sends.length, 0);
  assert.deepEqual(await h.get(), started);
});

test("a valid foreign agent and project hook cannot authorize the current agent's history fallback", async (t) => {
  const { h, a, input, started } = await fallbackHarness(t);
  await h.start(await h.input({ workspaceId: "other", agentId: "foreign-agent", requestId: "other-project-request" }));
  a.beforeReload = async () => {
    const foreignHook = await h.openAgent("foreign-agent", "other");
    assert.equal(foreignHook?.tools.length, 3, "The foreign attachment is real and authorized for its own project");
  };
  await assert.rejects(h.deliver(input));
  assert.equal(a.sends.length, 0);
  assert.deepEqual(await h.get(), started);
  assert.equal(h.agents.get("foreign-agent")!.sends.length, 0);
});

test("generic reload failures stay fatal even when the same reload attached all tools", async (t) => {
  const { h, a, input, started } = await fallbackHarness(t);
  a.reloadFailure = new Error("thread/items/list failed: permission denied");
  a.beforeReload = async () => { assert.equal((await h.openAgent())?.tools.length, 3); };
  await assert.rejects(h.deliver(input));
  assert.equal(a.sends.length, 0);
  assert.deepEqual(await h.get(), started);
});

test("the history text with an unrelated numeric RPC error code is not treated as the known provider limitation", async (t) => {
  const { h, a, input, started } = await fallbackHarness(t);
  a.reloadFailure = Object.assign(new Error(unsupportedHistory), { code: -32603 });
  a.beforeReload = async () => { assert.equal((await h.openAgent())?.tools.length, 3); };
  await assert.rejects(h.deliver(input));
  assert.equal(a.sends.length, 0);
  assert.deepEqual(await h.get(), started);
});

for (const state of ["archived", "running"] as const) {
  test(`a fresh ${state} agent snapshot prevents the known-history fallback`, async (t) => {
    const { h, a, input, started } = await fallbackHarness(t);
    a.beforeReload = async () => {
      assert.equal((await h.openAgent())?.tools.length, 3);
      // This change becomes visible only when the agent is refreshed after the failure.
      a.beforeRefresh = async () => {
        if (state === "archived") a.archivedAt = "2026-11-15";
        else { a.status = "running"; a.activeTurn = { id: "provider-turn" }; }
      };
    };
    const result = await Promise.allSettled([h.deliver(input)]);
    if (result[0].status === "fulfilled") assert.equal(result[0].value.status, "waiting");
    assert.equal(a.sends.length, 0);
    assert.deepEqual(await h.get(), started);
  });
}

test("closing a logical session during the known-history failure prevents fallback send", async (t) => {
  const { h, a, input } = await fallbackHarness(t);
  a.beforeReload = async () => {
    assert.equal((await h.openAgent())?.tools.length, 3);
    const current = await h.get();
    await h.rpc("board.apply", { workspaceId: "main", expectedRevision: current.board.revision, expectedFingerprint: current.fingerprint, command: { type: "session.closing", sessionId: input.sessionId } });
  };
  await assert.rejects(h.deliver(input));
  assert.equal(a.sends.length, 0);
  assert.equal((await h.get()).board.sessions[0].status, "closing");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}
async function settleCallbacks() {
  for (let i = 0; i < 4; i++) await new Promise<void>(resolve => setImmediate(resolve));
}
type AgentEntry = { agent: { id: string; workspaceId: string; archivedAt: string | null } };
const entry = (id: string, workspaceId = "main", archivedAt: string | null = null): AgentEntry => ({ agent: { id, workspaceId, archivedAt } });
type PillInput = Parameters<PluginClientContext["addComposerPill"]>[0];
type PillPatch = Parameters<ReturnType<PluginClientContext["addComposerPill"]>["update"]>[0];
type DirectorySnapshot = { entries: AgentEntry[]; pageInfo: { hasMore: boolean; nextCursor?: string }; subscriptionId: string; subscription: object };
type DirectoryObserver = { snapshot: (snapshot: DirectorySnapshot) => void; update: (message: unknown) => void; error: (error: unknown) => void };
let pillHost = 0;
function pillHarness(t: TestContext, options: {
  entries?: AgentEntry[];
  delayedList?: boolean;
  delayedWorkspace?: boolean;
  bootstrapRemove?: string;
  secondPage?: AgentEntry[];
  panelBeforePills?: boolean;
} = {}) {
  const host = `independent-pill-host-${++pillHost}`;
  const scope = projectScope(host, "same-project");
  const pills: { input: PillInput; updates: PillPatch[]; removed: number }[] = [];
  const opened: { id: string; options: unknown }[] = [];
  const boardCalls: { reader: "panel" | "pill"; workspaceId: string }[] = [];
  const unavailableWorkspaces = new Set<string>();
  const panelValues: string[] = [], panelErrors: unknown[] = [];
  let boardFingerprint = "missing";
  let observer!: DirectoryObserver;
  let releases = 0, unsubscribed = 0, boardReads = 0, lookups = 0;
  const listReady = deferred<DirectorySnapshot>();
  const workspaceReady = deferred<{ projectId: string }>();
  async function readBoard(workspaceId: string, reader: "panel" | "pill") {
    boardReads++;
    boardCalls.push({ reader, workspaceId });
    if (unavailableWorkspaces.has(workspaceId)) throw new Error("Workspace was removed after its last chat was archived");
    return { board: emptyBoard("pill-board"), fingerprint: boardFingerprint, root: "mock-only" };
  }
  if (options.panelBeforePills) {
    const stop = boardObservations.watch(scope, () => readBoard("main", "panel"), next => panelValues.push(next.fingerprint), error => panelErrors.push(error));
    t.after(stop);
  }
  const subscription = {
    release: async () => { releases++; },
    subscribe: (next: DirectoryObserver) => {
      observer = next;
      // The installed SDK synchronously replays its cached snapshot, then buffered updates.
      observer.snapshot(snapshot);
      if (options.bootstrapRemove) observer.update({ type: "agent_update", payload: { kind: "remove", agentId: options.bootstrapRemove } });
      return () => { unsubscribed++; };
    },
  };
  const snapshot: DirectorySnapshot = { entries: options.entries || [entry("first")], pageInfo: { hasMore: !!options.secondPage, ...(options.secondPage ? { nextCursor: "page-two" } : {}) }, subscriptionId: "subscription", subscription };
  const client = {
    paseo: {
      agents: {
        list: async (input: { page?: { cursor?: string } }) => input.page?.cursor
          ? { ...snapshot, entries: options.secondPage || [], pageInfo: { hasMore: false } }
          : options.delayedList ? listReady.promise : snapshot,
        ref: () => ({ address: { serverId: host } }),
      },
      workspaces: { ref: () => ({ refresh: async () => { lookups++; return options.delayedWorkspace ? workspaceReady.promise : { projectId: "same-project" }; } }) },
    },
    rpc: async (_contract: unknown, input: { workspaceId: string }) => readBoard(input.workspaceId, "pill"),
    addComposerPill: (input: PillInput) => {
      const record = { input, updates: [] as PillPatch[], removed: 0 };
      pills.push(record);
      return { update: (patch: PillPatch) => record.updates.push(patch), remove: () => { record.removed++; } };
    },
    openPanel: (id: string, options: unknown) => opened.push({ id, options }),
  } as unknown as PluginClientContext;
  const dispose = startChatPills(client);
  t.after(dispose);
  return { pills, opened, snapshot, dispose, emit: (message: unknown) => observer.update(message), publish: (next: DirectorySnapshot) => observer.snapshot(next), listReady, workspaceReady, boardCalls, unavailableWorkspaces, panelValues, panelErrors, setBoardFingerprint: (value: string) => { boardFingerprint = value; }, refresh: () => boardObservations.refresh(scope), counts: () => ({ releases, unsubscribed, boardReads, lookups }) };
}

test("composer pills share one project observation and open the exact clicked conversation", async (t) => {
  const h = pillHarness(t, { entries: [entry("first"), entry("second", "worktree"), entry("archived", "main", "2026-11-14")] });
  await settleCallbacks();
  assert.deepEqual(h.pills.map(p => p.input.agentId), ["first", "second"]);
  assert.equal(h.counts().boardReads, 1);
  for (const pill of h.pills) assert.equal(pill.updates.at(-1)?.label, "Criar Business Canvas");
  const action = h.pills[1].input.button.behavior;
  assert.equal(action.kind, "action");
  if (action.kind === "action") await action.onPress();
  assert.deepEqual(h.opened, [{ id: "board-conversation", options: { workspaceId: "worktree", agentId: "second", location: "explorer" } }]);
  h.dispose();
  h.dispose();
  await settleCallbacks();
  assert.deepEqual(h.pills.map(p => p.removed), [1, 1]);
  assert.equal(h.counts().releases, 1);
  assert.equal(h.counts().unsubscribed, 1);
});

test("composer directory pagination reaches conversations outside the first page", async (t) => {
  const h = pillHarness(t, { entries: [entry("first")], secondPage: [entry("last", "worktree")] });
  await settleCallbacks();
  assert.deepEqual(h.pills.map(p => p.input.agentId), ["first", "last"]);
  assert.equal(h.counts().boardReads, 1);
});

test("a removal replayed during subscription bootstrap cannot resurrect a stale composer pill", async (t) => {
  const h = pillHarness(t, { entries: [entry("removed-before-subscribe")], bootstrapRemove: "removed-before-subscribe" });
  await settleCallbacks();
  assert.deepEqual(h.pills.filter(p => !p.removed).map(p => p.input.agentId), []);
  assert.equal(h.counts().boardReads, 0);
});

test("disposing composer discovery before the list resolves releases it without creating pills", async (t) => {
  const h = pillHarness(t, { delayedList: true });
  h.dispose();
  h.listReady.resolve(h.snapshot);
  await settleCallbacks();
  assert.deepEqual(h.pills, []);
  assert.equal(h.counts().releases, 1);
  assert.equal(h.counts().boardReads, 0);
});

test("a removed conversation stays removed when its pending workspace lookup completes", async (t) => {
  const h = pillHarness(t, { delayedWorkspace: true });
  await settleCallbacks();
  assert.equal(h.pills.length, 1);
  h.emit({ type: "agent_update", payload: { kind: "remove", agentId: "first" } });
  h.workspaceReady.resolve({ projectId: "same-project" });
  await settleCallbacks();
  assert.equal(h.pills[0].removed, 1);
  assert.equal(h.counts().boardReads, 0);
  assert.deepEqual(h.pills[0].updates, []);
});

test("moving a chat to another workspace replaces its pill context and cleanup removes only live registrations", async (t) => {
  const h = pillHarness(t);
  await settleCallbacks();
  h.emit({ type: "agent_update", payload: { kind: "update", agent: entry("first", "worktree").agent } });
  await settleCallbacks();
  assert.equal(h.pills.length, 2);
  assert.equal(h.pills[0].removed, 1);
  assert.equal(h.pills[1].input.workspaceId, "worktree");
  h.dispose();
  assert.deepEqual(h.pills.map(p => p.removed), [1, 1]);
});

for (const panelBeforePills of [false, true]) {
  test(`archiving the first workspace's last chat moves project reads to a surviving chat${panelBeforePills ? " despite an older panel reader" : ""}`, async (t) => {
    const h = pillHarness(t, { entries: [entry("first", "main"), entry("second", "worktree")], panelBeforePills });
    await settleCallbacks();
    assert.deepEqual(h.pills.filter(p => !p.removed).map(p => p.input.agentId), ["first", "second"]);
    const lookupCount = h.counts().lookups;
    // W1 disappears after A is archived; B/W2 is still part of this same project.
    h.unavailableWorkspaces.add("main");
    h.emit({ type: "agent_update", payload: { kind: "update", agent: entry("first", "main", "2026-11-15").agent } });
    h.setBoardFingerprint("saved-canonical-board");
    const callCount = h.boardCalls.length;
    await h.refresh();
    await settleCallbacks();
    assert.deepEqual(h.boardCalls.slice(callCount), [{ reader: "pill", workspaceId: "worktree" }]);
    assert.deepEqual(h.pills.filter(p => !p.removed).map(p => p.input.agentId), ["second"]);
    assert.equal(h.pills.find(p => p.input.agentId === "second")!.updates.at(-1)?.label, "Abrir Business Canvas");
    assert.equal(h.counts().lookups, lookupCount, "The live directory should supply the replacement without reconnecting");
    assert.equal(h.counts().releases, 0);
    assert.equal(h.counts().unsubscribed, 0);
    assert.deepEqual(h.panelErrors, []);
    if (panelBeforePills) assert.equal(h.panelValues.at(-1), "saved-canonical-board");
  });
}
