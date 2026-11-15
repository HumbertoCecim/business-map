import type { Board, Card, Section } from "./model";

export type CanvasBand = { columns: { span: number; sectionIds: string[] }[] };
export type CanvasLayout = {
  columns: number;
  mosaic: boolean;
  bands: CanvasBand[];
};

/** Ordered visual grouping only: no business semantics or persisted coordinates. */
export function canvasLayout(
  sectionIds: readonly string[],
  maxColumns = 5,
): CanvasLayout {
  const count = sectionIds.length;
  if (!count) return { columns: 1, mosaic: false, bands: [] };
  const columns = Math.max(1, Math.min(5, Math.floor(maxColumns) || 1, count));
  if (columns === 5 && count >= 7 && count <= 9) {
    const sizes =
      count === 9
        ? [1, 2, 1, 2, 1]
        : count === 8
          ? [1, 2, 1, 1, 1]
          : [1, 1, 1, 1, 1];
    let offset = 0;
    const top = sizes.map((size) => {
      const sectionIdsForColumn = sectionIds.slice(offset, offset + size);
      offset += size;
      return { span: 1, sectionIds: sectionIdsForColumn };
    });
    return {
      columns: 5,
      mosaic: true,
      bands: [
        { columns: top },
        {
          columns: [
            { span: 2, sectionIds: [sectionIds[offset]] },
            { span: 3, sectionIds: [sectionIds[offset + 1]] },
          ],
        },
      ],
    };
  }
  const rowCount = Math.ceil(count / columns);
  const base = Math.floor(count / rowCount),
    extra = count % rowCount;
  let offset = 0;
  const bands = Array.from({ length: rowCount }, (_, index) => {
    const size = base + (index < extra ? 1 : 0);
    const row = sectionIds
      .slice(offset, offset + size)
      .map((id) => ({ span: 1, sectionIds: [id] }));
    offset += size;
    return { columns: row };
  });
  return { columns, mosaic: false, bands };
}

export function canvasNotes(
  section: Section,
  limit: number,
): { visible: Card[]; remaining: number } {
  const visible = section.cards.slice(0, Math.max(0, limit));
  return { visible, remaining: section.cards.length - visible.length };
}

/** Resolving a selection never mutates the board; existing editors own all writes. */
export function canvasSelection(
  board: Board,
  sectionId: string,
  cardId?: string,
): { section: Section; card?: Card } | null {
  const section = board.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  if (!cardId) return { section };
  const card = section.cards.find((c) => c.id === cardId);
  return card ? { section, card } : null;
}
