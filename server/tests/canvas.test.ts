import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canvasLayout,
  canvasNotes,
  canvasSelection,
} from "../../shared/canvas-layout";
import { emptyBoard, type Board } from "../../shared/model";

for (const count of [3, 7, 9, 15])
  test(`Canvas ${count} areas: ordered complete layout fits each band`, () => {
    const ids = Object.freeze(
      Array.from({ length: count }, (_, i) => `area-${i}`),
    );
    const before = [...ids];
    const result = canvasLayout(ids);
    assert.deepEqual(
      result.bands.flatMap((b) => b.columns.flatMap((c) => c.sectionIds)),
      before,
    );
    assert.equal(
      new Set(
        result.bands.flatMap((b) => b.columns.flatMap((c) => c.sectionIds)),
      ).size,
      count,
    );
    for (const band of result.bands) {
      const sum = band.columns.reduce((n, c) => n + c.span, 0);
      assert.ok(sum > 0 && sum <= result.columns);
      assert.ok(
        band.columns.every((c) => c.span > 0 && c.sectionIds.length > 0),
      );
    }
    assert.equal(result.mosaic, count === 7 || count === 9);
    assert.deepEqual(ids, before);
  });
test("Canvas compact widths retain every area without overflow or semantic reassignment", () => {
  for (const columns of [1, 2, 5])
    for (let count = 0; count <= 30; count++) {
      const ids = Array.from({ length: count }, (_, i) => String(i));
      const layout = canvasLayout(ids, columns);
      assert.deepEqual(
        layout.bands.flatMap((b) => b.columns.flatMap((c) => c.sectionIds)),
        ids,
      );
      assert.ok(
        layout.bands.every(
          (b) => b.columns.reduce((n, c) => n + c.span, 0) <= columns,
        ),
      );
      assert.deepEqual(canvasLayout(ids, columns), layout);
    }
});
test("Canvas previews and selection keep all content, order, authorship and focus untouched", () => {
  const b: Board = {
    ...emptyBoard("board"),
    sections: [
      {
        id: "area",
        title: "My own area",
        questions: "My own question",
        cards: Array.from({ length: 8 }, (_, i) => ({
          id: `card-${i}`,
          title: `Title ${i}`,
          text: `Human text ${i}`,
          firstStep: "Ask",
          lane: "later" as const,
          done: false,
          important: i === 4,
          urgent: false,
          sourceSuggestionId: i === 1 ? "accepted-candidate" : undefined,
        })),
      },
    ],
    focus: { visible: true, limit: 3, cardIds: ["card-5"] },
  };
  const before = structuredClone(b);
  function freeze(value: object) {
    Object.freeze(value);
    for (const child of Object.values(value))
      if (child && typeof child === "object") freeze(child);
  }
  freeze(b);
  const preview = canvasNotes(b.sections[0], 3);
  assert.deepEqual(
    preview.visible.map((c) => c.id),
    ["card-0", "card-1", "card-2"],
  );
  assert.equal(preview.remaining, 5);
  const selection = canvasSelection(b, "area", "card-6");
  assert.equal(selection?.card?.text, "Human text 6");
  assert.equal(canvasSelection(b, "foreign"), null);
  assert.equal(canvasSelection(b, "area", "foreign"), null);
  assert.equal(canvasSelection(b, "area")?.section.title, "My own area");
  assert.deepEqual(b, before);
  assert.deepEqual(b.focus.cardIds, ["card-5"]);
});
