import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyBoard, type Card } from "../../shared/model";
import type { SkillVersion } from "../../shared/evolution";
import { ASK_PROMPT_LIMIT, buildAskBoardContext, buildAskPrompt, loadAskSkills } from "../ask-context";
import { AskManager } from "../ask";

const card = (id: string, text = "Confirmed text"): Card => ({ id, title: id, text, firstStep: "Ask", lane: "later", done: false, important: false, urgent: false });
const noSkills = { versions: [], omissions: [] };
test("selected card context includes its area and adjacent edges while unrelated full content stays absent", () => {
  const board = emptyBoard("board");
  board.sections = [
    { id: "area-a", title: "Selected area", questions: "Relevant question", cards: [{ ...card("a"), sourceIds: ["source-a"] }, card("sibling", "Same area evidence")] },
    { id: "area-b", title: "Other area", questions: "UNRELATED_QUESTION_SECRET", cards: [card("b", "UNRELATED_CARD_SECRET")] },
  ];
  board.relations = [{ id: "adjacent", fromId: "a", toId: "b", label: "depends on" }];
  board.sources = [{ id: "source-a", kind: "note", label: "Relevant", text: "Relevant source evidence", createdAt: "now" }, { id: "source-b", kind: "note", label: "Other", text: "UNRELATED_SOURCE_SECRET", createdAt: "now" }];
  board.memories = [
    { id: "memory-a", kind: "context", target: { kind: "card", id: "a" }, text: "Relevant memory", rationale: "Relevant", sourceSuggestionId: null, createdAt: "now" },
    { id: "memory-b", kind: "context", target: { kind: "section", id: "area-b" }, text: "UNRELATED_MEMORY_SECRET", rationale: "Hidden", sourceSuggestionId: null, createdAt: "now" },
  ];
  board.receipts = { "internal": "UNRELATED_RECEIPT_SECRET" };
  const before = structuredClone(board), prompt = buildAskPrompt({ question: "Explore this card", targetIds: ["a"] }, board, noSkills);
  for (const secret of ["UNRELATED_CARD_SECRET", "UNRELATED_QUESTION_SECRET", "UNRELATED_SOURCE_SECRET", "UNRELATED_MEMORY_SECRET", "UNRELATED_RECEIPT_SECRET"]) assert.ok(!prompt.includes(secret));
  for (const evidence of ["Same area evidence", "Relevant memory", "Relevant source evidence", "depends on", "Other area"]) assert.ok(prompt.includes(evidence));
  const context = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
  assert.equal(context.board.sections.length, 1); assert.equal(context.board.sections[0].cards.length, 2);
  assert.deepEqual(context.board.overview[1], { id: "area-b", title: "Other area", cardCount: 1, included: false });
  assert.deepEqual(board, before);
});
test("whole-map card excerpts have explicit omission notes and keep JSON intact", () => {
  const board = emptyBoard("board"); board.sections = [{ id: "area", title: "Area", questions: "?", cards: [card("a", "a".repeat(5000) + "OMITTED_TAIL_SECRET")] }];
  const prompt = buildAskPrompt({ question: "Overview" }, board, noSkills), parsed = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
  assert.equal(parsed.board.sections[0].cards[0].text.length, 4000); assert.ok(!prompt.includes("OMITTED_TAIL_SECRET"));
  assert.ok(parsed.board.omissions.some((note: any) => note.path === "card:a/text" && note.originalChars === 5019 && note.includedChars === 4000));
  assert.ok(prompt.length <= ASK_PROMPT_LIMIT);
  assert.throws(() => buildAskBoardContext(board, ["removed-card"]), /ASK_TARGET_NOT_FOUND/);
});
function skill(files: SkillVersion["files"]): SkillVersion {
  const treeHash = "a".repeat(64), skillId = `skill-${treeHash.slice(0, 20)}`, id = `${skillId}@${treeHash}`;
  return { id, skillId, name: "Evidence skill", description: "Review evidence", treeHash, files, sourcePath: "source", sourceUrl: "", createdAt: "now", parentVersionId: null, originalVersionId: id, rationale: "Confirmed", diff: "VERY_LARGE_PRIVATE_DIFF_NOT_SENT" };
}
test("Ask skills read only UTF-8 resources, cap excerpts and name every omission", async () => {
  const board = emptyBoard("board"), version = skill([
    { path: "SKILL.md", size: 15000, sha256: "a".repeat(64), encoding: "utf8" },
    { path: "assets/example.bin", size: 1000, sha256: "b".repeat(64), encoding: "base64" },
  ]);
  board.skills = [version]; board.selectedSkillVersionIds = [version.id];
  const reads: string[] = [], context = await loadAskSkills(board, async (_version, resource) => { reads.push(resource); return { encoding: "utf8", content: "x".repeat(15000), sha256: "a".repeat(64) }; });
  assert.deepEqual(reads, ["SKILL.md"]); assert.equal(context.versions[0].resources[0].content.length, 12000);
  assert.ok(context.omissions.some(note => note.path.endsWith("SKILL.md") && note.originalChars === 15000));
  assert.ok(context.omissions.some(note => note.path.endsWith("assets/example.bin") && note.reason.includes("Binary")));
  assert.ok(!JSON.stringify(context).includes("VERY_LARGE_PRIVATE_DIFF_NOT_SENT"));
  assert.equal(version.files.length, 2);
});
test("oversized skills and prompts fail clearly before a provider is resolved or spawned", async () => {
  const board = emptyBoard("board"), version = skill(Array.from({ length: 7 }, (_, i) => ({ path: i ? `references/${i}.md` : "SKILL.md", size: 12000, sha256: "a".repeat(64), encoding: "utf8" as const })));
  board.skills = [version]; board.selectedSkillVersionIds = [version.id];
  await assert.rejects(loadAskSkills(board, async () => ({ encoding: "utf8", content: "x".repeat(12000) })), /ASK_CONTEXT_TOO_LARGE.*fewer skills/);
  board.selectedSkillVersionIds = []; board.sections = [{ id: "area", title: "Area", questions: "?", cards: Array.from({ length: 80 }, (_, i) => card(`card-${i}`, "x".repeat(4000))) }];
  assert.throws(() => buildAskPrompt({ question: "Too much" }, board, noSkills), /ASK_CONTEXT_TOO_LARGE.*smaller area/);
  let providers = 0, writes = 0;
  const manager = new AskManager(async () => { writes++; return []; }, async () => noSkills, async () => { providers++; return null; });
  const job = manager.start({ requestId: "too-large", provider: "codex", question: "Too much" }, { board, fingerprint: "unused", root: "unused" });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(job.status, "error"); assert.match(job.error || "", /ASK_CONTEXT_TOO_LARGE/); assert.equal(providers, 0); assert.equal(writes, 0); await manager.close();
});
