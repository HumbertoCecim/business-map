import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BoardStore, type Location } from "../store";
import { SkillRepository, validateRelativePath } from "../skills";
import { emptyBoard, parseBoard, reduceBoard, type Board, type Suggestion } from "../../shared/model";
import type { LogicalSession, SkillVersion } from "../../shared/evolution";

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "business-evolution-"));
  const parent = path.resolve(os.tmpdir());
  assert.equal(path.dirname(path.resolve(root)), parent);
  assert.ok(path.basename(root).startsWith("business-evolution-"));
  t.after(async () => {
    // Cleanup is limited to the exact temporary directory created by this fixture.
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.ok(path.basename(root).startsWith("business-evolution-"));
    await rm(root, { recursive: true, force: true });
  });
  const project = path.join(root, "project");
  await mkdir(project);
  const location: Location = { root: project, projectId: "test-project" };
  return { root, location, repository: new SkillRepository(), store: new BoardStore() };
}
async function exists(file: string) {
  try { await access(file); return true; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; }
}
const skillText = "---\nname: Research\ndescription: Ground evidence before advising.\n---\nRead references/evidence.md and keep the human in control.\n";
async function source(root: string, name = "source", reverse = false) {
  const directory = path.join(root, name);
  const marker = path.join(root, "script-executed");
  const files = new Map<string, Buffer>([
    ["SKILL.md", Buffer.from(skillText)],
    ["references/evidence.md", Buffer.from("# Evidence\nSupporting context and non-ASCII: ação.\n")],
    ["assets/sample.bin", Buffer.from([0, 255, 13, 128, 42])],
    ["scripts/helper.cjs", Buffer.from(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\n`)],
  ]);
  for (const [relative, bytes] of reverse ? [...files].reverse() : files) {
    const file = path.join(directory, ...relative.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  return { directory, files, marker };
}
function humanBoard(): Board {
  const b = emptyBoard("board-human");
  b.title = "Human title";
  b.sections = [{ id: "area", title: "Human area", questions: "Human question?", cards: [{ id: "card", title: "Human card", text: "Human reasoning", firstStep: "Human next step", lane: "now", done: false, important: true, urgent: false }] }];
  b.focus = { visible: true, limit: 1, cardIds: ["card"] };
  b.whereStopped = "Human continuation";
  b.agent = { id: "agent", skills: ["legacy-reference"], endOfConversation: false };
  b.memories = [{ id: "existing-memory", kind: "decision", text: "Existing human decision", rationale: "Established", target: { kind: "card", id: "card" }, sourceSuggestionId: null, createdAt: "2026-01-01" }];
  b.receipts = { "agent:old": "old-payload" };
  return b;
}
function legacy() {
  const { skills: _skills, selectedSkillVersionIds: _selected, sessions: _sessions, currentSessionId: _current, ...b } = humanBoard();
  return { ...b, schemaVersion: 1 as const };
}
function version(seed: string): SkillVersion {
  const digest = seed.repeat(64);
  const skillId = `skill-${digest.slice(0, 20)}`;
  const id = `${skillId}@${digest}`;
  return { id, skillId, name: "Test skill", description: "Test description", treeHash: digest, files: [{ path: "SKILL.md", size: 1, sha256: digest, encoding: "utf8" }], sourcePath: "test", sourceUrl: "", createdAt: "2026-11-14", parentVersionId: null, originalVersionId: id, rationale: "Human import", diff: "" };
}
function session(b: Board, id = "session"): LogicalSession {
  return { id, objective: "Validate the business hypothesis", agentId: "agent", skillVersionIds: [...b.selectedSkillVersionIds], startedAt: "2026-11-14T10:00:00Z", closedAt: null, status: "active", grilling: "off", summary: "", summarySuggestionId: null };
}
function candidate(b: Board, kind: Suggestion["kind"], id: string): Suggestion {
  return { id, requestId: `request-${id}`, kind, title: "Agent proposal", text: "Agent proposed text", rationale: "Evidence to review", target: { kind: "board", id: b.boardId }, structure: [], sourceAgentId: "agent", baseRevision: b.revision, createdAt: "2026-11-14", status: "pending", stale: false, sessionId: b.currentSessionId || undefined };
}
function activeBoard() {
  let b = humanBoard();
  b = reduceBoard(b, { type: "skill.register", version: version("a") });
  b = reduceBoard(b, { type: "skill.register", version: version("b") });
  b = reduceBoard(b, { type: "skill.select", versionIds: [version("a").id] });
  return reduceBoard(b, { type: "session.start", session: session(b) });
}

test("v1 migration preserves all human content and does not mutate its input", () => {
  const raw = legacy();
  const before = structuredClone(raw);
  const migrated = parseBoard(raw);
  assert.deepEqual(raw, before);
  const { skills, selectedSkillVersionIds, sessions, currentSessionId, schemaVersion, ...preserved } = migrated;
  const { schemaVersion: _legacyVersion, ...originalContent } = before;
  assert.equal(schemaVersion, 3);
  assert.deepEqual(preserved, originalContent);
  assert.deepEqual([skills, selectedSkillVersionIds, sessions, currentSessionId], [[], [], [], null]);
});

test("GET of v1 returns v3 compatibility state without writing files", async (t) => {
  const { location, store } = await fixture(t);
  const dir = path.join(location.root, ".business-board");
  await mkdir(dir);
  const raw = "  " + JSON.stringify(legacy()) + "\r\n";
  await writeFile(path.join(dir, "board.json"), raw);
  const first = await store.get(location);
  assert.equal(first.board.schemaVersion, 3);
  assert.ok(first.warning);
  assert.deepEqual(await store.get(location), first);
  assert.equal(await readFile(path.join(dir, "board.json"), "utf8"), raw);
  assert.deepEqual(await readdir(dir), ["board.json"]);
});

test("first v1 write preserves exact migration bytes and later writes rotate only the normal backup", async (t) => {
  const { location, store } = await fixture(t);
  const dir = path.join(location.root, ".business-board");
  await mkdir(dir);
  const raw = Buffer.from("\t" + JSON.stringify(legacy(), null, 4) + "\r\n");
  await writeFile(path.join(dir, "board.json"), raw);
  let state = await store.get(location);
  state = await store.apply(location, state.board.revision, state.fingerprint, { type: "title", title: "After migration" });
  assert.equal(state.board.schemaVersion, 3);
  assert.deepEqual(await readFile(path.join(dir, "board.v1.backup.json")), raw);
  assert.deepEqual(await readFile(path.join(dir, "board.backup.json")), raw);
  const firstV2 = await readFile(path.join(dir, "board.json"));
  state = await store.apply(location, state.board.revision, state.fingerprint, { type: "whereStopped", text: "New continuation" });
  assert.deepEqual(await readFile(path.join(dir, "board.backup.json")), firstV2);
  assert.deepEqual(await readFile(path.join(dir, "board.v1.backup.json")), raw);
  assert.equal(state.board.sections[0].cards[0].text, "Human reasoning");
});

test("full-folder preview is read-only and confirmed import retains references, binary assets and inert scripts", async (t) => {
  const { root, location, repository } = await fixture(t);
  const input = await source(root);
  const preview = await repository.preview(input.directory, "https://example.com/source");
  assert.equal(await exists(path.join(location.root, ".business-board")), false);
  assert.equal(preview.version.files.length, input.files.size);
  assert.equal(preview.totalBytes, [...input.files.values()].reduce((sum, b) => sum + b.length, 0));
  const imported = await repository.import(location, input.directory, preview.version.treeHash, "https://example.com/source");
  assert.equal(imported.sourceUrl, "https://example.com/source");
  for (const [resource, bytes] of input.files) {
    const read = await repository.read(location, imported, resource);
    assert.deepEqual(Buffer.from(read.content, read.encoding), bytes);
  }
  assert.equal((await repository.read(location, imported, "assets/sample.bin")).encoding, "base64");
  assert.equal(await exists(input.marker), false);
});

test("folder identity is independent of creation order and duplicate confirmation reuses one canonical version", async (t) => {
  const { root, location, repository } = await fixture(t);
  const first = await source(root, "first");
  const second = await source(root, "second", true);
  const a = await repository.preview(first.directory), b = await repository.preview(second.directory);
  assert.equal(a.version.treeHash, b.version.treeHash);
  assert.equal(a.version.id, b.version.id);
  await repository.import(location, first.directory, a.version.treeHash);
  await repository.import(location, second.directory, b.version.treeHash);
  const managed = path.join(location.root, ".business-board", "skills");
  assert.deepEqual(await readdir(managed), [a.version.skillId]);
  assert.deepEqual(await readdir(path.join(managed, a.version.skillId)), [a.version.treeHash]);
});

test("folded YAML description ends at the next metadata field", async (t) => {
  const { root, repository } = await fixture(t);
  const input = await source(root);
  await writeFile(path.join(input.directory, "SKILL.md"), "---\nname: Evidence skill\ndescription: >-\n  First description line\n  second description line.\nmetadata:\n  author: Private author detail\n---\n# Instructions\nRead the evidence.\n");
  const preview = await repository.preview(input.directory);
  assert.equal(preview.version.name, "Evidence skill");
  assert.equal(preview.version.description, "First description line second description line.");
  assert.ok(!preview.version.description.includes("author"));
});

test("confirmation refuses a folder changed after preview before creating managed directories", async (t) => {
  const { root, location, repository } = await fixture(t);
  const input = await source(root);
  const preview = await repository.preview(input.directory);
  await writeFile(path.join(input.directory, "references", "evidence.md"), "Changed evidence");
  await assert.rejects(repository.import(location, input.directory, preview.version.treeHash), /CONFLICT/);
  assert.equal(await exists(path.join(location.root, ".business-board")), false);
});

test("source traversal rejects junctions and symbolic links rather than importing their contents", async (t) => {
  const { root, repository } = await fixture(t);
  const input = await source(root);
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "private.txt"), "Not part of source");
  try { await symlink(outside, path.join(input.directory, "linked"), process.platform === "win32" ? "junction" : "dir"); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EPERM") { t.skip("Host disallows symlinks"); return; } throw e; }
  await assert.rejects(repository.preview(input.directory), /Links|links|junction/);
});

test("a source root alias resolves to the same canonical skill folder", async (t) => {
  const { root, location, repository } = await fixture(t);
  const input = await source(root);
  const link = path.join(root, "linked-source");
  try { await symlink(input.directory, link, process.platform === "win32" ? "junction" : "dir"); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EPERM") { t.skip("Host disallows symlinks"); return; } throw e; }
  const direct = await repository.preview(input.directory);
  const preview = await repository.preview(link);
  assert.equal(preview.version.treeHash, direct.version.treeHash);
  assert.equal(preview.version.sourcePath, await realpath(input.directory));
  const imported = await repository.import(location, link, preview.version.treeHash);
  assert.equal((await repository.read(location, imported)).content, skillText);
});

test("a source inside a junction ancestor imports from its resolved real folder", async (t) => {
  const { root, location, repository } = await fixture(t);
  const realParent = path.join(root, "real-parent");
  await mkdir(realParent);
  const input = await source(realParent);
  const alias = path.join(root, "parent-alias");
  try { await symlink(realParent, alias, process.platform === "win32" ? "junction" : "dir"); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EPERM") { t.skip("Host disallows symlinks"); return; } throw e; }
  const aliasedSource = path.join(alias, path.basename(input.directory));
  const direct = await repository.preview(input.directory);
  const preview = await repository.preview(aliasedSource);
  assert.equal(preview.version.treeHash, direct.version.treeHash);
  assert.equal(preview.version.sourcePath, await realpath(input.directory));
  const imported = await repository.import(location, aliasedSource, preview.version.treeHash);
  for (const [resource, bytes] of input.files) {
    const read = await repository.read(location, imported, resource);
    assert.deepEqual(Buffer.from(read.content, read.encoding), bytes);
  }
  assert.equal(await exists(input.marker), false);
});

for (const gitKind of ["file", "directory"] as const) {
  test(`root .git ${gitKind} is excluded with a warning and does not affect confirmed folder identity`, async (t) => {
    const { root, location, repository } = await fixture(t);
    const input = await source(root);
    const baseline = await repository.preview(input.directory);
    const git = path.join(input.directory, ".git");
    const metadata = gitKind === "directory" ? path.join(git, "config") : git;
    if (gitKind === "directory") await mkdir(git);
    await writeFile(metadata, gitKind === "directory" ? "[remote]\nurl = private-repository\n" : "gitdir: ../private-worktree\n");
    const preview = await repository.preview(input.directory);
    assert.equal(preview.version.treeHash, baseline.version.treeHash);
    assert.deepEqual(preview.version.files, baseline.version.files);
    assert.equal(preview.totalBytes, baseline.totalBytes);
    assert.ok(preview.warnings.some(warning => warning.includes(".git")), "Excluded Git metadata must be disclosed in preview");
    // Changes to excluded repository metadata do not invalidate content approval.
    await writeFile(metadata, "Different private Git metadata\n");
    const imported = await repository.import(location, input.directory, preview.version.treeHash);
    assert.ok(imported.files.every(file => file.path !== ".git" && !file.path.startsWith(".git/")));
    const exported = await repository.export(location, imported);
    assert.equal(exported.fileCount, input.files.size);
    assert.equal(await exists(path.join(exported.path, ".git")), false);
    for (const [resource, bytes] of input.files) assert.deepEqual(await readFile(path.join(exported.path, ...resource.split("/"))), bytes);
    assert.equal(await exists(input.marker), false);
  });
}

test("resource traversal, absolute paths and Windows alternate streams are rejected", () => {
  for (const value of ["../SKILL.md", "/SKILL.md", "a/../../outside", "a\\SKILL.md", "C:/secret", "SKILL.md:stream", "a//b", "a/./b", "a./b", "a /b", "a/\0b"]) {
    assert.throws(() => validateRelativePath(value), /Caminho/, value);
  }
  assert.equal(validateRelativePath("references/evidence.md"), "references/evidence.md");
});

test("forged version identities are refused before export or derivation creates directories", async (t) => {
  const { location, repository } = await fixture(t);
  const forged = { ...version("a"), id: "../../forged" };
  await assert.rejects(repository.export(location, forged));
  await assert.rejects(repository.previewDerived(location, forged, skillText, "Human reason"));
  assert.equal(await exists(path.join(location.root, ".business-board")), false);
});

test("derived versions preserve every resource, parent and original provenance and leave original content intact", async (t) => {
  const { root, location, repository } = await fixture(t);
  const input = await source(root);
  const originalPreview = await repository.preview(input.directory);
  const original = await repository.import(location, input.directory, originalPreview.version.treeHash);
  const changedText = skillText + "Ask for evidence before making a proposal.\n";
  const preview = await repository.previewDerived(location, original, changedText, "Human requested narrower advice");
  const derived = await repository.derive(location, original, changedText, "Human requested narrower advice", preview.version.treeHash);
  assert.equal(derived.parentVersionId, original.id);
  assert.equal(derived.originalVersionId, original.id);
  assert.equal(derived.skillId, original.skillId);
  assert.notEqual(derived.id, original.id);
  assert.match(derived.diff, /Ask for evidence/);
  for (const [resource, bytes] of input.files) {
    const originalRead = await repository.read(location, original, resource);
    const derivedRead = await repository.read(location, derived, resource);
    assert.deepEqual(Buffer.from(originalRead.content, originalRead.encoding), bytes);
    assert.deepEqual(Buffer.from(derivedRead.content, derivedRead.encoding), resource === "SKILL.md" ? Buffer.from(changedText) : bytes);
  }
  const nextPreview = await repository.previewDerived(location, derived, changedText + "One question at a time.\n", "Refine the dialogue");
  assert.equal(nextPreview.version.parentVersionId, derived.id);
  assert.equal(nextPreview.version.originalVersionId, original.id);
  assert.equal(await exists(input.marker), false);
});

test("unchanged derived text creates no version and registering a derivative does not change human selection", async (t) => {
  const { root, location, repository } = await fixture(t);
  const input = await source(root);
  const p = await repository.preview(input.directory);
  const original = await repository.import(location, input.directory, p.version.treeHash);
  await assert.rejects(repository.previewDerived(location, original, skillText, "No actual edit"), /Sem altera/);
  const managed = path.join(location.root, ".business-board", "skills", original.skillId);
  assert.deepEqual(await readdir(managed), [original.treeHash]);
  const derived = await repository.previewDerived(location, original, skillText + "Edited.\n", "Human reason");
  let board = reduceBoard(humanBoard(), { type: "skill.register", version: original });
  board = reduceBoard(board, { type: "skill.select", versionIds: [original.id] });
  board = reduceBoard(board, { type: "skill.register", version: derived.version });
  assert.deepEqual(board.selectedSkillVersionIds, [original.id]);
});

test("external canonical content changes are detected on read, derivation and export", async (t) => {
  const { root, location, repository } = await fixture(t);
  const input = await source(root);
  const p = await repository.preview(input.directory);
  const imported = await repository.import(location, input.directory, p.version.treeHash);
  await writeFile(path.join(location.root, ".business-board", "skills", imported.skillId, imported.treeHash, "files", "references", "evidence.md"), "External replacement");
  await assert.rejects(repository.read(location, imported, "references/evidence.md"), /externally_modified/);
  await assert.rejects(repository.previewDerived(location, imported, skillText + "Edited.\n", "Reason"), /externally_modified/);
  await assert.rejects(repository.export(location, imported), /externally_modified/);
});

test("an unmanifested canonical file is inaccessible even when it exists on disk", async (t) => {
  const { root, location, repository } = await fixture(t);
  const input = await source(root);
  const p = await repository.preview(input.directory);
  const imported = await repository.import(location, input.directory, p.version.treeHash);
  await writeFile(path.join(location.root, ".business-board", "skills", imported.skillId, imported.treeHash, "files", "unconfirmed.txt"), "Unreviewed");
  await assert.rejects(repository.read(location, imported, "unconfirmed.txt"), /manifesto/);
  const forgedManifest = { ...imported, files: imported.files.map(f => f.path === "SKILL.md" ? { ...f, size: f.size + 1 } : f) };
  await assert.rejects(repository.read(location, forgedManifest), /externally_modified/);
});

test("export reproduces the complete confirmed folder byte for byte without executing scripts", async (t) => {
  const { root, location, repository } = await fixture(t);
  const input = await source(root);
  const p = await repository.preview(input.directory);
  const imported = await repository.import(location, input.directory, p.version.treeHash);
  const result = await repository.export(location, imported);
  assert.equal(result.fileCount, input.files.size);
  assert.equal(result.treeHash, imported.treeHash);
  for (const [resource, bytes] of input.files) assert.deepEqual(await readFile(path.join(result.path, ...resource.split("/"))), bytes);
  assert.equal(await exists(input.marker), false);
});

test("logical session starts on the chosen existing agent, skills and objective without changing human content", () => {
  const original = humanBoard();
  const active = reduceBoard(original, { type: "session.start", session: session(original) });
  assert.equal(active.currentSessionId, "session");
  assert.equal(active.sessions[0].objective, "Validate the business hypothesis");
  assert.deepEqual(active.sections, original.sections);
  assert.deepEqual(active.focus, original.focus);
  assert.deepEqual(original.sessions, []);
  assert.throws(() => reduceBoard(active, { type: "session.start", session: session(active, "second") }));
  assert.throws(() => reduceBoard(original, { type: "session.start", session: { ...session(original), agentId: "foreign-agent" } }));
  assert.throws(() => reduceBoard(original, { type: "session.start", session: { ...session(original), skillVersionIds: ["not-imported"] } }));
});

test("grilling transitions are explicit and closing only requests review while pausing the dialogue", () => {
  let b = activeBoard();
  const before = structuredClone(b);
  b = reduceBoard(b, { type: "session.grilling", sessionId: "session", state: "running" });
  assert.equal(b.sessions[0].grilling, "running");
  b = reduceBoard(b, { type: "session.grilling", sessionId: "session", state: "paused" });
  assert.equal(b.sessions[0].grilling, "paused");
  b = reduceBoard(b, { type: "session.closing", sessionId: "session" });
  assert.equal(b.sessions[0].status, "closing");
  assert.equal(b.sessions[0].grilling, "paused");
  assert.equal(b.sessions[0].closedAt, null);
  assert.equal(b.currentSessionId, "session");
  assert.deepEqual(b.memories, before.memories);
  assert.equal(b.whereStopped, before.whereStopped);
  assert.deepEqual(b.focus, before.focus);
  assert.throws(() => reduceBoard(b, { type: "session.grilling", sessionId: "session", state: "running" }));
});

test("human skill selection during an open session explicitly updates that session and leaves closed history intact", () => {
  const b = activeBoard();
  const selected = reduceBoard(b, { type: "skill.select", versionIds: [version("b").id, version("b").id] });
  assert.deepEqual(selected.selectedSkillVersionIds, [version("b").id]);
  assert.deepEqual(selected.sessions[0].skillVersionIds, [version("b").id]);
  assert.deepEqual(selected.sessions[0].initialSkillVersionIds, [version("a").id]);
  assert.deepEqual(b.sessions[0].skillVersionIds, [version("a").id]);
  const closed = reduceBoard(selected, { type: "session.confirm", sessionId: "session", closedAt: "2026-11-14T11:00:00Z", summary: "Confirmed", whereStopped: "Confirmed continuation", decisions: [] });
  const changedLater = reduceBoard(closed, { type: "skill.select", versionIds: [version("a").id] });
  assert.deepEqual(changedLater.sessions[0].skillVersionIds, [version("b").id]);
  assert.deepEqual(changedLater.sessions[0].initialSkillVersionIds, [version("a").id]);
});

test("card draft and session summary remain proposals until an explicit human command", () => {
  const before = activeBoard();
  const cardDraft = { ...candidate(before, "card_draft", "card-proposal"), cardDraft: { title: "Agent title", text: "Agent card", firstStep: "Agent step" } };
  const summary = { ...candidate(before, "session_summary", "summary-proposal"), whereStopped: "Agent continuation", decisions: [{ text: "Agent decision", rationale: "Agent reason", targetKind: "board" as const, targetId: before.boardId }] };
  let b = reduceBoard(before, { type: "suggestion.submit", suggestion: cardDraft });
  b = reduceBoard(b, { type: "suggestion.submit", suggestion: summary });
  assert.deepEqual(b.sections, before.sections);
  assert.deepEqual(b.focus, before.focus);
  assert.deepEqual(b.memories, before.memories);
  assert.equal(b.whereStopped, before.whereStopped);
  assert.deepEqual(b.sessions, before.sessions);
  assert.deepEqual(b.suggestions.map(s => s.status), ["pending", "pending"]);
  const accepted = reduceBoard(b, { type: "card.save", sectionId: "area", sourceSuggestionId: "card-proposal", card: { ...b.sections[0].cards[0], id: "human-accepted", title: "Human edited title", text: "Human revised proposal", firstStep: "Human edited step" } });
  assert.equal(accepted.sections[0].cards[1].text, "Human revised proposal");
  assert.deepEqual(accepted.focus, before.focus);
  assert.equal(accepted.suggestions[0].status, "incorporated");
  assert.equal(accepted.suggestions[1].status, "pending");
});

test("session confirmation persists only selected human-edited decisions and summary while preserving focus and original cards", () => {
  let b = activeBoard();
  const before = structuredClone(b);
  const summary = { ...candidate(b, "session_summary", "summary"), whereStopped: "Agent continuation", decisions: [{ text: "Accept this?", rationale: "Agent rationale", targetKind: "card" as const, targetId: "card" }, { text: "Skip this?", rationale: "Other", targetKind: "board" as const, targetId: b.boardId }] };
  b = reduceBoard(b, { type: "suggestion.submit", suggestion: summary });
  b = reduceBoard(b, { type: "session.closing", sessionId: "session" });
  b = reduceBoard(b, { type: "session.confirm", sessionId: "session", closedAt: "2026-11-14T11:00:00Z", summary: "Human edited summary", whereStopped: "Human edited continuation", suggestionId: "summary", decisions: [{ id: "accepted-decision", kind: "decision", text: "Human edited decision", rationale: "Human checked rationale", target: { kind: "card", id: "card" }, sourceSuggestionId: "summary", createdAt: "2026-11-14" }] });
  assert.equal(b.currentSessionId, null);
  assert.equal(b.sessions[0].status, "closed");
  assert.equal(b.sessions[0].summary, "Human edited summary");
  assert.equal(b.sessions[0].summarySuggestionId, "summary");
  assert.equal(b.sessions[0].grilling, "off");
  assert.equal(b.whereStopped, "Human edited continuation");
  assert.deepEqual(b.memories.slice(0, 1), before.memories);
  assert.equal(b.memories.length, 2);
  assert.equal(b.memories[1].text, "Human edited decision");
  assert.equal(b.suggestions[0].status, "incorporated");
  assert.deepEqual(b.sections, before.sections);
  assert.deepEqual(b.focus, before.focus);
  assert.throws(() => reduceBoard(b, { type: "session.confirm", sessionId: "session", closedAt: "later", summary: "Second close", whereStopped: "Second", decisions: [] }));
});

test("session confirmation rejects foreign targets and unrelated summary candidates atomically", () => {
  const b = activeBoard();
  const before = structuredClone(b);
  const close = { type: "session.confirm" as const, sessionId: "session", closedAt: "today", summary: "Summary", whereStopped: "Continuation", decisions: [{ id: "invalid", kind: "decision" as const, text: "Decision", rationale: "Reason", target: { kind: "card" as const, id: "foreign" }, sourceSuggestionId: null, createdAt: "today" }] };
  assert.throws(() => reduceBoard(b, close));
  assert.deepEqual(b, before);
  const unrelated = reduceBoard(b, { type: "suggestion.submit", suggestion: candidate(b, "insight", "insight") });
  assert.throws(() => reduceBoard(unrelated, { ...close, decisions: [], suggestionId: "insight" }));
});

test("session-scoped suggestions reject a forged source agent", () => {
  const b = activeBoard();
  assert.throws(() => reduceBoard(b, { type: "suggestion.submit", suggestion: { ...candidate(b, "session_summary", "forged"), sourceAgentId: "impostor" } }));
  assert.deepEqual(b.suggestions, []);
});
