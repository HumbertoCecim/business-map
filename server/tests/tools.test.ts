import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import type {
  AgentToolContext,
  AgentToolDefinition,
  PluginServerContext,
} from "@getpaseo/plugin/server";
import contribute from "../../index.server";
import { mapDraftSchema, type Board } from "../../shared/model";
import { adapterServices } from "./adapter-service.fixture";
type Snapshot = { board: Board; fingerprint: string };
type Handler = (input: unknown, ctx: { paseo: PaseoApi }) => Promise<unknown>;
type Open = (
  event: {
    request: {
      agentId: string;
      workspaceId: string;
      purpose: string;
      tools: AgentToolDefinition[];
    };
  },
  ctx: { paseo: PaseoApi },
) => Promise<{ tools: AgentToolDefinition[] } | undefined>;
async function harness(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "business-tools-"));
  const service = await adapterServices([root]);
  t.after(async () => {
    await service.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("business-tools-"));
    await rm(root, { recursive: true, force: true });
  });
  const handlers = new Map<string, Handler>();
  let open!: Open;
  let reloads = 0;
  const server = {
    handle(contract: { name: string }, handler: Handler) {
      handlers.set(contract.name, handler);
    },
    addHook(_name: string, hook: Open) {
      open = hook;
      return () => {};
    },
  } as unknown as PluginServerContext;
  const paseo = {
    workspaces: {
      ref: (id: string) => ({
        refresh: async () => ({
          projectId: id === "foreign" ? "other" : "project",
        }),
      }),
    },
    projects: {
      list: async () => ({
        projects: [
          { projectId: "project", projectRootPath: root },
          { projectId: "other", projectRootPath: path.join(root, "other") },
        ],
      }),
    },
    agents: {
      ref: (id: string) => ({
        refresh: async () => ({
          agent: { id, workspaceId: "workspace", archivedAt: null },
        }),
        status: "idle",
        activeTurn: null,
        reload: async () => {
          reloads++;
        },
      }),
    },
  } as unknown as PaseoApi;
  contribute(server);
  const rpc = async (name: string, input: unknown) =>
    handlers.get(name)!(input, { paseo });
  const get = async () =>
    (await rpc("board.get", { workspaceId: "workspace" })) as Snapshot;
  const optIn = async (id: string | null) => {
    const s = await get();
    return rpc("board.apply", {
      workspaceId: "workspace",
      expectedRevision: s.board.revision,
      expectedFingerprint: s.fingerprint,
      command: { type: "agent", id, skills: [], endOfConversation: false },
    });
  };
  const tools = async (id: string) =>
    (
      await open(
        {
          request: {
            agentId: id,
            workspaceId: "workspace",
            purpose: "interactive",
            tools: [],
          },
        },
        { paseo },
      )
    )?.tools.map((tool) => ({
      ...tool,
      execute: async (...args: Parameters<AgentToolDefinition["execute"]>) =>
        tool.execute(...args),
    }));
  const ctx = (id: string): AgentToolContext => ({
    agent: {
      id,
      workspaceId: "workspace",
      parentAgentId: null,
      provider: "codex",
      cwd: root,
      title: "Existing",
    },
    paseo,
    signal: new AbortController().signal,
  });
  return { root, rpc, get, optIn, tools, ctx, reloads: () => reloads };
}
test("only explicitly opted agent receives tools; read-only context and binding", async (t) => {
  const h = await harness(t);
  assert.equal(await h.tools("chosen"), undefined);
  await h.optIn("chosen");
  const tools = await h.tools("chosen");
  assert.deepEqual(
    tools!.map((t) => t.name),
    [
      "business_get_context",
      "business_submit_suggestion",
      "business_read_skill",
    ],
  );
  assert.equal(await h.tools("other"), undefined);
  const before = await h.get();
  const result = await tools![0].execute({}, h.ctx("chosen"));
  assert.equal(
    (result.structuredContent as Board).boardId,
    before.board.boardId,
  );
  assert.deepEqual(await h.get(), before);
  await h.rpc("board.bind", { workspaceId: "workspace", agentId: "chosen" });
  assert.equal(h.reloads(), 1);
});
test("tool candidates preserve human content, capture source, mark stale and deduplicate", async (t) => {
  const h = await harness(t);
  await h.optIn("chosen");
  const tools = await h.tools("chosen");
  const before = await h.get();
  const submit = tools![1];
  const input = {
    requestId: "r",
    baseRevision: 0,
    kind: "memory",
    title: "Candidate",
    text: "Durable candidate",
    rationale: "Why",
    targetKind: "board",
    targetId: before.board.boardId,
  };
  await submit.execute(input, h.ctx("chosen"));
  const first = await h.get();
  assert.equal(first.board.suggestions[0].sourceAgentId, "chosen");
  assert.equal(first.board.suggestions[0].stale, true);
  assert.equal(first.board.memories.length, 0);
  assert.deepEqual(first.board.sections, before.board.sections);
  assert.deepEqual(first.board.focus, before.board.focus);
  await submit.execute(input, h.ctx("chosen"));
  assert.deepEqual(await h.get(), first);
  await assert.rejects(
    submit.execute({ ...input, text: "Changed retry" }, h.ctx("chosen")),
    /requestId/,
  );
});
test("revocation applies to tools already attached; source and foreign targets cannot be forged", async (t) => {
  const h = await harness(t);
  await h.optIn("chosen");
  const tools = await h.tools("chosen");
  const b = (await h.get()).board;
  const input = {
    requestId: "r",
    baseRevision: b.revision,
    kind: "insight",
    title: "x",
    text: "x",
    rationale: "x",
    targetKind: "card",
    targetId: "foreign-card",
  };
  await assert.rejects(tools![1].execute(input, h.ctx("chosen")), /Alvo/);
  await assert.rejects(
    tools![0].execute({}, h.ctx("impostor")),
    /não autorizado/,
  );
  await h.optIn(null);
  await assert.rejects(
    tools![0].execute({}, h.ctx("chosen")),
    /não autorizado/,
  );
});
test("human RPC cannot impersonate agent suggestion submission", async (t) => {
  const h = await harness(t);
  const s = await h.get();
  await assert.rejects(
    h.rpc("board.apply", {
      workspaceId: "workspace",
      expectedRevision: s.board.revision,
      expectedFingerprint: s.fingerprint,
      command: { type: "suggestion.submit", suggestion: {} },
    }),
    /autoria/,
  );
});
test("RPC full-skill preview/confirm and canonical tool read verify resources and scope", async (t) => {
  const h = await harness(t);
  await h.optIn("chosen");
  const source = path.join(h.root, "source");
  await mkdir(path.join(source, "references"), { recursive: true });
  const text =
    "---\nname: qa-skill\ndescription: >-\n  Complete context\n  preserved\nmetadata:\n  author: Alice\n---\n# QA\nRead references/context.md.\n";
  await writeFile(path.join(source, "SKILL.md"), text);
  await writeFile(
    path.join(source, "references", "context.md"),
    "CANONICAL-214",
  );
  const preview = (await h.rpc("skill.preview", {
    workspaceId: "workspace",
    sourcePath: source,
  })) as { version: { treeHash: string } };
  const before = await h.get();
  assert.equal(before.board.skills.length, 0);
  await h.rpc("skill.confirm", {
    workspaceId: "workspace",
    expectedRevision: before.board.revision,
    expectedFingerprint: before.fingerprint,
    sourcePath: source,
    treeHash: preview.version.treeHash,
  });
  const imported = await h.get(),
    version = imported.board.skills[0];
  assert.equal(version.description, "Complete context preserved");
  const tools = await h.tools("chosen"),
    read = tools!.find((x) => x.name === "business_read_skill")!;
  const result = await read.execute(
    { versionId: version.id, resource: "references/context.md" },
    h.ctx("chosen"),
  );
  const resource = result.structuredContent as {
    content: string;
    canonicalSkillRoot: string;
    canonicalResourcePath: string;
  };
  assert.equal(resource.content, "CANONICAL-214");
  assert.ok(
    resource.canonicalSkillRoot.startsWith(
      path.join(h.root, ".business-board", "skills"),
    ),
  );
  assert.equal(
    await readFile(resource.canonicalResourcePath, "utf8"),
    resource.content,
  );
  assert.deepEqual(await h.get(), imported);
  await assert.rejects(
    read.execute(
      { versionId: version.id, resource: "../source/SKILL.md" },
      h.ctx("chosen"),
    ),
    /inválido/,
  );
  await assert.rejects(
    read.execute({ versionId: version.id }, h.ctx("impostor")),
    /não autorizado/,
  );
  await writeFile(resource.canonicalResourcePath, "external edit");
  await assert.rejects(
    read.execute(
      { versionId: version.id, resource: "references/context.md" },
      h.ctx("chosen"),
    ),
    /externally_modified/,
  );
  await h.optIn(null);
  await assert.rejects(
    read.execute({ versionId: version.id }, h.ctx("chosen")),
    /não autorizado/,
  );
});
test("new candidate kinds remain pending and cannot forge full-skill registration through board RPC", async (t) => {
  const h = await harness(t);
  await h.optIn("chosen");
  const initial = await h.get();
  const submit = (await h.tools("chosen"))![1];
  const base = {
    baseRevision: initial.board.revision,
    title: "Candidate",
    text: "Candidate text",
    rationale: "Evidence",
    targetKind: "board",
    targetId: initial.board.boardId,
  };
  await assert.rejects(
    submit.execute(
      { ...base, requestId: "bad", kind: "skill_import" },
      h.ctx("chosen"),
    ),
    /caminho/,
  );
  await assert.rejects(
    submit.execute(
      {
        ...base,
        requestId: "bad2",
        kind: "skill_adjustment",
        skillText: "partial",
      },
      h.ctx("chosen"),
    ),
    /original/,
  );
  await assert.rejects(
    submit.execute(
      { ...base, requestId: "bad3", kind: "session_summary" },
      h.ctx("chosen"),
    ),
    /sessão aberta/,
  );
  await submit.execute(
    {
      ...base,
      requestId: "skill",
      kind: "skill_import",
      sourcePath: path.join(h.root, "downloaded"),
    },
    h.ctx("chosen"),
  );
  await submit.execute(
    {
      ...base,
      requestId: "card",
      kind: "card_draft",
      cardDraft: { title: "Draft", text: "Proposed content", firstStep: "Ask" },
    },
    h.ctx("chosen"),
  );
  const next = await h.get();
  assert.equal(next.board.suggestions.length, 2);
  assert.ok(
    next.board.suggestions.every(
      (s) => s.status === "pending" && s.sourceAgentId === "chosen",
    ),
  );
  assert.deepEqual(next.board.sections, initial.board.sections);
  assert.equal(next.board.skills.length, 0);
  assert.deepEqual(next.board.focus, initial.board.focus);
  await assert.rejects(
    h.rpc("board.apply", {
      workspaceId: "workspace",
      expectedRevision: next.board.revision,
      expectedFingerprint: next.fingerprint,
      command: { type: "skill.register", version: {} },
    }),
    /autoria/,
  );
});
test("derived RPC refuses an already imported ancestor without falsely incorporating the candidate", async (t) => {
  const h = await harness(t);
  await h.optIn("chosen");
  const source = path.join(h.root, "skill");
  await mkdir(source);
  const text = "---\nname: qa\ndescription: qa\n---\nOriginal";
  await writeFile(path.join(source, "SKILL.md"), text);
  const p = (await h.rpc("skill.preview", {
    workspaceId: "workspace",
    sourcePath: source,
  })) as { version: { treeHash: string } };
  let s = await h.get();
  await h.rpc("skill.confirm", {
    workspaceId: "workspace",
    sourcePath: source,
    treeHash: p.version.treeHash,
    expectedRevision: s.board.revision,
    expectedFingerprint: s.fingerprint,
  });
  s = await h.get();
  const original = s.board.skills[0];
  const d = (await h.rpc("skill.derive.preview", {
    workspaceId: "workspace",
    parentVersionId: original.id,
    skillText: text + "\nAdjusted",
    rationale: "More context",
  })) as { version: { treeHash: string } };
  await h.rpc("skill.derive.confirm", {
    workspaceId: "workspace",
    parentVersionId: original.id,
    skillText: text + "\nAdjusted",
    rationale: "More context",
    treeHash: d.version.treeHash,
    expectedRevision: s.board.revision,
    expectedFingerprint: s.fingerprint,
  });
  s = await h.get();
  const derivative = s.board.skills.find((v) => v.id !== original.id)!;
  await assert.rejects(
    h.rpc("skill.derive.preview", {
      workspaceId: "workspace",
      parentVersionId: derivative.id,
      skillText: text,
      rationale: "Return",
    }),
    /já existe/,
  );
  await assert.rejects(
    h.rpc("skill.derive.confirm", {
      workspaceId: "workspace",
      parentVersionId: derivative.id,
      skillText: text,
      rationale: "Return",
      treeHash: original.treeHash,
      expectedRevision: s.board.revision,
      expectedFingerprint: s.fingerprint,
    }),
    /já existe/,
  );
  assert.deepEqual(await h.get(), s);
});

test("native map_draft travels through the real service and stays pending without changing human content or priorities", async (t) => {
  const h = await harness(t);
  await h.optIn("chosen");
  let base = await h.get();
  await h.rpc("board.apply", {
    workspaceId: "workspace", expectedRevision: base.board.revision, expectedFingerprint: base.fingerprint,
    command: { type: "section.save", section: {
      id: "human-area", title: "Human customer reasoning", questions: "Keep this question",
      cards: [{ id: "human-card", title: "Chosen human priority", text: "Keep the human explanation", firstStep: "Call customer", lane: "now", done: false, important: true, urgent: true }],
    } },
  });
  base = await h.get();
  await h.rpc("board.apply", {
    workspaceId: "workspace", expectedRevision: base.board.revision, expectedFingerprint: base.fingerprint,
    command: { type: "focus", visible: true, limit: 1, cardIds: ["human-card"] },
  });
  const before = await h.get();
  const submit = (await h.tools("chosen"))!.find(tool => tool.name === "business_submit_suggestion")!;
  const mapDraft = mapDraftSchema.parse({
    sections: [{ id: "draft-area", title: "Candidate delivery", questions: "", cards: [{ id: "draft-card", title: "Delivery hypothesis", text: "A proposal for review", firstStep: "Validate with customer", lane: "later", done: false, important: false, urgent: false, semanticType: "hypothesis", sourceIds: ["declared-source"] }] }],
    relations: [{ id: "draft-relation", fromId: "human-card", toId: "draft-card", label: "may support" }],
    sources: [{ id: "declared-source", kind: "founder_statement", label: "Founder report", text: "A reported observation, not verified field evidence", createdAt: "2026-11-15" }],
  });
  const input = {
    requestId: "native-map", baseRevision: before.board.revision, kind: "map_draft", title: "Candidate business map",
    text: "Review the delivery hypothesis", rationale: "Based on the founder report", targetKind: "board", targetId: before.board.boardId,
  };
  await assert.rejects(submit.execute(input, h.ctx("chosen")), /mapDraft/);
  assert.deepEqual(await h.get(), before);
  await submit.execute({ ...input, mapDraft }, h.ctx("chosen"));
  const after = await h.get();
  assert.equal(after.board.revision, before.board.revision + 1);
  assert.equal(after.board.suggestions.length, 1);
  const candidate = after.board.suggestions[0];
  assert.equal(candidate.kind, "map_draft");
  assert.equal(candidate.status, "pending");
  assert.equal(candidate.sourceAgentId, "chosen");
  assert.deepEqual(candidate.mapDraft, mapDraft);
  for (const field of ["title", "sections", "focus", "memories", "whereStopped", "relations", "sources"] as const) {
    assert.deepEqual(after.board[field], before.board[field], `${field} remains human-controlled`);
  }
  await submit.execute({ ...input, mapDraft }, h.ctx("chosen"));
  assert.deepEqual(await h.get(), after);
});
