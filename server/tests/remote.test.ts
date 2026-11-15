import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { RemoteBoardStore, RemoteSkillRepository } from "../remote";
import contribute from "../../index.server";
import type { SkillVersion } from "../../shared/evolution";
import { adapterServices } from "./adapter-service.fixture";
import { runtimePath } from "../service-runtime";
import { pairServiceRpc } from "../../shared/service-rpc";
import { startService } from "../../local/server";
import { emptyBoard } from "../../shared/model";
import { getBoardRpc } from "../../shared/rpc";

test("an unavailable service leaves project, skill source and runtime untouched for every adapter operation", async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), "business-remote-"));
  const priorHome = process.env.BUSINESS_MAP_HOME;
  const runtimeHome = path.join(base, "uncreated-runtime");
  process.env.BUSINESS_MAP_HOME = runtimeHome;
  t.after(async () => {
    if (priorHome === undefined) delete process.env.BUSINESS_MAP_HOME;
    else process.env.BUSINESS_MAP_HOME = priorHome;
    assert.equal(path.dirname(base), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith("business-remote-"));
    await rm(base, { recursive: true, force: true });
  });
  const root = path.join(base, "registered"), source = path.join(base, "source");
  await mkdir(root);
  await mkdir(source);
  await writeFile(path.join(root, "human.txt"), "keep human content");
  await writeFile(path.join(source, "SKILL.md"), "# Original skill");
  const location = { projectId: "paseo-project", root };
  const store = new RemoteBoardStore(), skills = new RemoteSkillRepository();
  const version = { id: "not-imported" } as SkillVersion;
  const operations = [
    () => store.get(location),
    () => store.apply(location, 0, "missing", { type: "title", title: "Do not write" }),
    () => store.export(location, true),
    () => skills.forProject(location).preview(source),
    () => skills.import(location, source, "hash"),
    () => skills.read(location, version),
    () => skills.previewDerived(location, version, "# Adjusted", "Reason"),
    () => skills.derive(location, version, "# Adjusted", "Reason", "hash"),
    () => skills.export(location, version),
  ];
  for (const operation of operations) {
    await assert.rejects(operation(), (error: Error) => {
      assert.match(error.message, /business open --root/);
      assert.ok(error.message.includes(root));
      return true;
    });
  }
  assert.deepEqual(await readdir(base), ["registered", "source"]);
  assert.deepEqual(await readdir(root), ["human.txt"]);
  assert.deepEqual(await readdir(source), ["SKILL.md"]);
  assert.equal(await readFile(path.join(root, "human.txt"), "utf8"), "keep human content");
  assert.equal(await readFile(path.join(source, "SKILL.md"), "utf8"), "# Original skill");
});

test("the Paseo entry resolves the registered root, keeps RPCs and never falls back to a worktree writer", async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), "business-remote-root-"));
  const priorHome = process.env.BUSINESS_MAP_HOME;
  process.env.BUSINESS_MAP_HOME = path.join(base, "uncreated-runtime");
  t.after(async () => {
    if (priorHome === undefined) delete process.env.BUSINESS_MAP_HOME;
    else process.env.BUSINESS_MAP_HOME = priorHome;
    assert.equal(path.dirname(base), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith("business-remote-root-"));
    await rm(base, { recursive: true, force: true });
  });
  const root = path.join(base, "main"), worktree = path.join(base, "worktree");
  await mkdir(root);
  await mkdir(worktree);
  const handlers = new Map<string, (input: any, context: { paseo: PaseoApi }) => Promise<unknown>>();
  const plugin = {
    handle: (contract: { name: string }, handler: any) => handlers.set(contract.name, handler),
    addHook: () => () => {},
  } as unknown as PluginServerContext;
  const paseo = {
    workspaces: { ref: () => ({ refresh: async () => ({ projectId: "registered-id", workspaceDirectory: worktree }) }) },
    projects: { list: async () => ({ projects: [{ projectId: "registered-id", projectRootPath: root }] }) },
  } as unknown as PaseoApi;
  contribute(plugin);
  assert.ok(handlers.has("conversation.start"));
  assert.ok(handlers.has("skill.confirm"));
  await assert.rejects(handlers.get("board.get")!({ workspaceId: "worktree" }, { paseo }), (error: Error) => {
    assert.ok(error.message.includes(root));
    assert.ok(!error.message.includes(`--root ${JSON.stringify(worktree)}`));
    return true;
  });
  assert.deepEqual(await readdir(root), []);
  assert.deepEqual(await readdir(worktree), []);
  assert.deepEqual(await readdir(base), ["main", "worktree"]);
});

test("separate adapter clients share the service writer, conflicts and stable receipts", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "business-remote-writer-"));
  const service = await adapterServices([root]);
  t.after(async () => {
    await service.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("business-remote-writer-"));
    await rm(root, { recursive: true, force: true });
  });
  const location = { root, projectId: "paseo-id-independent-of-service-id" };
  const first = new RemoteBoardStore(), second = new RemoteBoardStore();
  const initial = await first.get(location);
  const outcomes = await Promise.allSettled([
    first.apply(location, initial.board.revision, initial.fingerprint, { type: "title", title: "First" }),
    second.apply(location, initial.board.revision, initial.fingerprint, { type: "title", title: "Second" }),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
  const rejected = outcomes.find(outcome => outcome.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.match(rejected.reason.message, /CONFLICT/);
  const current = await second.get(location);
  assert.equal(current.board.revision, initial.board.revision + 1);
  assert.deepEqual(current, await service.services[0].store.get({ root, projectId: service.services[0].runtime.projectId }));
  const command = { type: "whereStopped" as const, text: "Confirmed through service" };
  const receipt = { id: `agent:${"long-request".repeat(16)}`, value: "stable-payload-hash" };
  const saved = await first.apply(location, current.board.revision, current.fingerprint, command, receipt);
  assert.deepEqual(await second.apply(location, current.board.revision, current.fingerprint, command, receipt), saved);
  await assert.rejects(second.apply(location, current.board.revision, current.fingerprint, command, { ...receipt, value: "different" }), /requestId/);
});

test("Paseo reads before pairing, exchanges a viewer code without exposing its token, and requires pairing again after restart", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "business-remote-pair-"));
  const fixture = await adapterServices([root], { pair: false });
  t.after(async () => {
    await fixture.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("business-remote-pair-"));
    await rm(root, { recursive: true, force: true });
  });
  const location = { root, projectId: "paseo-project" }, store = new RemoteBoardStore();
  const before = await store.get(location);
  assert.ok(!JSON.parse(await readFile(await runtimePath(root), "utf8")).humanToken);
  assert.equal((await store.export(location, false)).path, null);
  await assert.rejects(store.apply(location, before.board.revision, before.fingerprint, { type: "title", title: "Not authorized" }), /PAIRING_REQUIRED/);
  assert.deepEqual(await store.get(location), before);
  const handlers = new Map<string, (input: any, context: { paseo: PaseoApi }) => Promise<any>>();
  contribute({ handle: (contract: { name: string }, handler: any) => handlers.set(contract.name, handler), addHook: () => () => {} } as unknown as PluginServerContext);
  const paseo = {
    workspaces: { ref: () => ({ refresh: async () => ({ projectId: "paseo-project" }) }) },
    projects: { list: async () => ({ projects: [{ projectId: "paseo-project", projectRootPath: root }] }) },
  } as unknown as PaseoApi;
  const pair = async (code: string) => pairServiceRpc.output.parse(await handlers.get(pairServiceRpc.name)!({ workspaceId: "workspace", code }, { paseo }));
  const issueCode = async () => {
    const runtime = fixture.services[0].runtime;
    const denied = await fetch(`${runtime.url}/api/pair/paseo-code`, { method: "POST", headers: { Authorization: `Bearer ${runtime.agentToken}`, "Content-Type": "application/json" }, body: "{}" });
    assert.equal(denied.status, 403);
    const response = await fetch(`${runtime.url}/api/pair/paseo-code`, { method: "POST", headers: { Authorization: `Bearer ${runtime.humanToken}`, "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, 200);
    return (await response.json() as { code: string }).code;
  };
  const code = await issueCode(), result = await pair(code);
  assert.equal(result.connected, true);
  assert.ok(!JSON.stringify(result).includes(fixture.services[0].runtime.humanToken));
  assert.ok(!("token" in result));
  const saved = await store.apply(location, before.board.revision, before.fingerprint, { type: "title", title: "Paired save" });
  assert.equal(saved.board.title, "Paired save");
  await assert.rejects(pair(code), /inválido|expirado|utilizado/);
  await fixture.services[0].stop();
  fixture.services[0] = await startService({ root });
  const restarted = await store.get(location);
  assert.equal(restarted.board.title, "Paired save");
  await assert.rejects(store.apply(location, restarted.board.revision, restarted.fingerprint, { type: "title", title: "Old capability" }), /PAIRING_REQUIRED/);
  await pair(await issueCode());
  assert.equal((await store.apply(location, restarted.board.revision, restarted.fingerprint, { type: "title", title: "Reconnected" })).board.title, "Reconnected");
  assert.ok(!JSON.parse(await readFile(await runtimePath(root), "utf8")).humanToken);
});

test("legacy board migration status survives the native RPC and saving preserves the old bytes until viewer confirmation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "business-remote-migration-"));
  await mkdir(path.join(root, ".business-board"));
  const file = path.join(root, ".business-board", "board.json");
  const legacyBytes = JSON.stringify({ ...emptyBoard("legacy-board"), schemaVersion: 2, title: "Legacy human content" });
  await writeFile(file, legacyBytes);
  const fixture = await adapterServices([root]);
  t.after(async () => {
    await fixture.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("business-remote-migration-"));
    await rm(root, { recursive: true, force: true });
  });
  const location = { root, projectId: "paseo-project" }, store = new RemoteBoardStore();
  const snapshot = getBoardRpc.output.parse(await store.get(location));
  assert.equal(snapshot.migrationRequired, true);
  assert.equal(snapshot.board.title, "Legacy human content");
  await assert.rejects(store.apply(location, snapshot.board.revision, snapshot.fingerprint, { type: "title", title: "Do not write yet" }), /MIGRATION_REQUIRED.*visualizador Business Map/);
  assert.equal(await readFile(file, "utf8"), legacyBytes);
});
