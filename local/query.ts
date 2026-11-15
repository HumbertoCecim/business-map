import type { Board } from "../shared/model";
export function queryBoard(board: Board, query: { mode?: string; text?: string; id?: string; fromId?: string; toId?: string }) {
  const nodes = board.sections.flatMap(s => [{ ...s, kind: "section", cards: undefined }, ...s.cards.map(c => ({ ...c, kind: "card", sectionId: s.id }))]);
  if (query.mode === "show") return nodes.find(n => n.id === query.id) || board.sources?.find(s => s.id === query.id) || null;
  if (query.mode === "find") { const text = (query.text || "").toLocaleLowerCase(); return nodes.filter(n => JSON.stringify(n).toLocaleLowerCase().includes(text)); }
  if (query.mode === "path") {
    const pending = [[query.fromId || ""]], seen = new Set<string>();
    while (pending.length) {
      const path = pending.shift()!, id = path.at(-1)!;
      if (id === query.toId) return path;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const r of board.relations || []) if (r.fromId === id) pending.push([...path, r.toId]);
    }
    return [];
  }
  return { boardId: board.boardId, title: board.title, revision: board.revision, sections: board.sections.map(s => ({ id: s.id, title: s.title, cards: s.cards.length })), cards: board.sections.reduce((n, s) => n + s.cards.length, 0), pending: board.suggestions.filter(s => s.status === "pending").length, whereStopped: board.whereStopped, focus: board.focus, relations: board.relations || [], sources: board.sources || [] };
}
