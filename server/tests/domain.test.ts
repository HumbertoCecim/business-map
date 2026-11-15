import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boardSchema,
  emptyBoard,
  reduceBoard,
  type Board,
  type Card,
  type Suggestion,
} from "../../shared/model";
import { exportMarkdown } from "../../shared/export";
import { friendlyError } from "../../shared/errors";
const card = (id: string): Card => ({
  id,
  title: id,
  text: "Texto humano",
  firstStep: "Perguntar",
  lane: "later",
  done: false,
  important: false,
  urgent: false,
});
const area = (id: string) => ({
  id,
  title: id,
  questions: "O que sabemos?",
  cards: [],
});
function populated(): Board {
  let b = reduceBoard(emptyBoard("b"), {
    type: "section.save",
    section: area("a"),
  });
  return reduceBoard(b, { type: "card.save", sectionId: "a", card: card("c") });
}
function suggestion(kind: Suggestion["kind"] = "insight"): Suggestion {
  return {
    id: "s",
    requestId: "r",
    kind,
    title: "Hipótese",
    text: "Texto do agente",
    rationale: "Justificativa",
    target: { kind: "board", id: "b" },
    structure: [{ title: "Teste", questions: "Quem?" }],
    sourceAgentId: "agent",
    baseRevision: 0,
    createdAt: "2026-11-14",
    status: "pending",
    stale: true,
  };
}
test("schema version and bounded fields", () => {
  assert.throws(() =>
    boardSchema.parse({ ...emptyBoard("b"), schemaVersion: 4 }),
  );
  assert.throws(() =>
    reduceBoard(emptyBoard("b"), { type: "title", title: "x".repeat(501) }),
  );
});

test("UI error messages retain recovery text without transport internals", () => {
  assert.equal(
    friendlyError(
      new Error(
        "Request failed: CONFLICT: o board mudou. Recarregue e revise. (requestType=plugin.rpc.invoke.request, code=handler_error)",
      ),
    ),
    "o board mudou. Recarregue e revise.",
  );
  assert.equal(
    friendlyError(
      "Request failed: Agente ocupado. requestType=plugin.rpc.invoke.request code=handler_error",
    ),
    "Agente ocupado.",
  );
  assert.equal(
    friendlyError(new Error("Arquivo inválido. Backup válido preservado.")),
    "Arquivo inválido. Backup válido preservado.",
  );
});
test("section CRUD and stable order; area edits preserve cards", () => {
  let b = populated();
  b = reduceBoard(b, { type: "section.save", section: area("d") });
  b = reduceBoard(b, { type: "section.move", id: "d", direction: "up" });
  assert.deepEqual(
    b.sections.map((s) => s.id),
    ["d", "a"],
  );
  b = reduceBoard(b, {
    type: "section.save",
    section: { ...area("a"), title: "Nova área" },
  });
  assert.equal(b.sections[1].cards[0].text, "Texto humano");
  b = reduceBoard(b, { type: "section.delete", id: "d" });
  assert.equal(b.sections.length, 1);
});
test("cards reorder and move across areas", () => {
  let b = populated();
  b = reduceBoard(b, { type: "card.save", sectionId: "a", card: card("d") });
  b = reduceBoard(b, {
    type: "card.move",
    id: "d",
    sectionId: "a",
    direction: "up",
  });
  assert.equal(b.sections[0].cards[0].id, "d");
  b = reduceBoard(b, { type: "section.save", section: area("z") });
  b = reduceBoard(b, {
    type: "card.move",
    id: "d",
    sectionId: "z",
    direction: "up",
  });
  assert.equal(b.sections[1].cards[0].id, "d");
});
test("focus is human-selected, capped, cleans completed and removed cards", () => {
  let b = populated();
  b = reduceBoard(b, {
    type: "focus",
    visible: true,
    limit: 1,
    cardIds: ["c", "c"],
  });
  assert.deepEqual(b.focus.cardIds, ["c"]);
  b = reduceBoard(b, {
    type: "card.save",
    sectionId: "a",
    card: { ...card("c"), done: true },
  });
  assert.deepEqual(b.focus.cardIds, []);
  assert.throws(() =>
    reduceBoard(b, {
      type: "focus",
      visible: true,
      limit: 3,
      cardIds: ["foreign"],
    }),
  );
});
test("suggestions preserve authorship, human text and focus", () => {
  const b = populated();
  const next = reduceBoard(b, {
    type: "suggestion.submit",
    suggestion: suggestion(),
  });
  assert.deepEqual(next.sections, b.sections);
  assert.deepEqual(next.focus, b.focus);
  assert.equal(next.suggestions[0].sourceAgentId, "agent");
  assert.equal(next.suggestions[0].status, "pending");
  assert.equal(next.memories.length, 0);
});
test("memory candidate requires separate confirmation command", () => {
  const b = reduceBoard(populated(), {
    type: "suggestion.submit",
    suggestion: suggestion("memory"),
  });
  const next = reduceBoard(b, {
    type: "memory.save",
    memory: {
      id: "m",
      kind: "decision",
      text: "Decisão humana",
      rationale: "Por quê",
      target: { kind: "card", id: "c" },
      sourceSuggestionId: "s",
      createdAt: "today",
    },
  });
  assert.equal(next.memories[0].text, "Decisão humana");
  assert.equal(next.suggestions[0].status, "incorporated");
  assert.equal(b.memories.length, 0);
});
test("foreign targets and duplicate IDs rejected", () => {
  assert.throws(() =>
    reduceBoard(populated(), {
      type: "suggestion.submit",
      suggestion: { ...suggestion(), target: { kind: "card", id: "outside" } },
    }),
  );
  assert.throws(() =>
    reduceBoard(populated(), { type: "section.save", section: area("c") }),
  );
});

test("editing confirmed memory preserves source and original creation date", () => {
  let b = reduceBoard(populated(), {
    type: "suggestion.submit",
    suggestion: suggestion("memory"),
  });
  const memory = {
    id: "m",
    kind: "decision" as const,
    text: "Original",
    rationale: "Original rationale",
    target: { kind: "card" as const, id: "c" },
    sourceSuggestionId: "s",
    createdAt: "2026-01-01T00:00:00Z",
  };
  b = reduceBoard(b, { type: "memory.save", memory });
  const next = reduceBoard(b, {
    type: "memory.save",
    memory: {
      ...memory,
      text: "Human correction",
      sourceSuggestionId: null,
      createdAt: "2026-11-14T00:00:00Z",
    },
  });
  assert.equal(next.memories[0].text, "Human correction");
  assert.equal(next.memories[0].sourceSuggestionId, "s");
  assert.equal(next.memories[0].createdAt, "2026-01-01T00:00:00Z");
  assert.equal(b.memories[0].text, "Original");
});
test("structure applies only selected edited items", () => {
  let b = reduceBoard(emptyBoard("b"), {
    type: "suggestion.submit",
    suggestion: suggestion("structure"),
  });
  b = reduceBoard(b, {
    type: "structure.apply",
    suggestionId: "s",
    items: [
      { id: "human", title: "Título revisado", questions: "Pergunta revisada" },
    ],
  });
  assert.equal(b.sections[0].title, "Título revisado");
  assert.equal(b.suggestions[0].status, "incorporated");
});
test("export deterministic includes focus, content, kept insights and decisions", () => {
  let b = populated();
  b = reduceBoard(b, { type: "suggestion.submit", suggestion: suggestion() });
  b = reduceBoard(b, { type: "suggestion.status", id: "s", status: "kept" });
  const md = exportMarkdown(b);
  assert.equal(md, exportMarkdown(b));
  assert.match(md, /Texto humano/);
  assert.match(md, /Texto do agente/);
  assert.match(md, /Fonte: agente agent/);
});
test("accepted area/card provenance is assigned by verified commands and survives human editing", () => {
  let b = reduceBoard(emptyBoard("b"), {
    type: "suggestion.submit",
    suggestion: suggestion("structure"),
  });
  b = reduceBoard(b, {
    type: "structure.apply",
    suggestionId: "s",
    items: [
      {
        id: "accepted-area",
        title: "Human reviewed",
        questions: "Reviewed question",
      },
    ],
  });
  assert.equal(b.sections[0].sourceSuggestionId, "s");
  b = reduceBoard(b, {
    type: "section.save",
    section: {
      ...b.sections[0],
      title: "Human edited later",
      sourceSuggestionId: "forged",
    },
  });
  assert.equal(b.sections[0].sourceSuggestionId, "s");
  b = reduceBoard(b, {
    type: "suggestion.submit",
    suggestion: {
      ...suggestion("card_draft"),
      id: "draft",
      requestId: "draft",
      target: { kind: "section", id: "accepted-area" },
      cardDraft: {
        title: "Agent title",
        text: "Agent content",
        firstStep: "Ask",
      },
    },
  });
  b = reduceBoard(b, {
    type: "card.save",
    sectionId: "accepted-area",
    sourceSuggestionId: "draft",
    card: { ...card("accepted-card"), text: "Human revised candidate" },
  });
  assert.equal(b.sections[0].cards[0].sourceSuggestionId, "draft");
  b = reduceBoard(b, {
    type: "card.save",
    sectionId: "accepted-area",
    card: {
      ...b.sections[0].cards[0],
      text: "Another human edit",
      sourceSuggestionId: "forged",
    },
  });
  assert.equal(b.sections[0].cards[0].sourceSuggestionId, "draft");
  b = reduceBoard(b, {
    type: "card.save",
    sectionId: "accepted-area",
    card: { ...card("human-card"), sourceSuggestionId: "draft" },
  });
  assert.equal(b.sections[0].cards[1].sourceSuggestionId, undefined);
  b = reduceBoard(b, {
    type: "section.save",
    section: {
      ...area("human-area"),
      sourceSuggestionId: "s",
      cards: [{ ...card("nested-human"), sourceSuggestionId: "draft" }],
    },
  });
  assert.equal(b.sections[1].sourceSuggestionId, undefined);
  assert.equal(b.sections[1].cards[0].sourceSuggestionId, undefined);
  assert.throws(() =>
    reduceBoard(b, {
      type: "card.save",
      sectionId: "accepted-area",
      sourceSuggestionId: "unknown",
      card: card("invalid-origin"),
    }),
  );
  assert.match(exportMarkdown(b), /Origem: sugestão draft/);
});
