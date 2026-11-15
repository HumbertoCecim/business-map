import { z } from "zod";
import {
  candidateFields,
  sessionSchema,
  skillVersionSchema,
} from "./evolution";

const id = z.string().min(1).max(160);
const short = z.string().max(500);
const text = z.string().max(30000);
export const targetSchema = z.object({
  kind: z.enum(["board", "section", "card"]),
  id: id,
});
export const cardSchema = z.object({
  id,
  sourceSuggestionId: id.optional(),
  title: short,
  text,
  firstStep: short,
  lane: z.enum(["now", "later"]),
  done: z.boolean(),
  important: z.boolean(),
  urgent: z.boolean(),
  semanticType: z.string().max(100).optional(),
  sourceIds: z.array(id).max(100).optional(),
});
export const sectionSchema = z.object({
  id,
  sourceSuggestionId: id.optional(),
  title: short,
  questions: text,
  cards: z.array(cardSchema).max(500),
});
export const structureItemSchema = z.object({ title: short, questions: text });
export const relationSchema = z.object({ id, fromId: id, toId: id, label: short });
export const sourceSchema = z.object({
  id, kind: z.enum(["founder_statement", "github_issue", "log_excerpt", "url", "note"]),
  label: short, text, url: z.string().max(4000).optional(), createdAt: z.string(),
});
export const mapDraftSchema = z.object({
  sections: z.array(sectionSchema).max(100),
  relations: z.array(relationSchema).max(2000),
  sources: z.array(sourceSchema).max(2000),
});
export const suggestionSchema = z.object({
  id,
  requestId: id,
  kind: z.enum([
    "insight",
    "structure",
    "memory",
    "skill_import",
    "skill_adjustment",
    "card_draft",
    "session_summary",
    "map_draft",
  ]),
  title: short,
  text,
  rationale: text,
  target: targetSchema,
  structure: z.array(structureItemSchema).max(30),
  sourceAgentId: id,
  baseRevision: z.number().int().nonnegative(),
  createdAt: z.string(),
  status: z.enum(["pending", "kept", "discarded", "incorporated"]),
  stale: z.boolean(),
  mapDraft: mapDraftSchema.optional(),
  ...candidateFields,
});
export const memorySchema = z.object({
  id,
  kind: z.enum(["context", "decision"]),
  text,
  rationale: text,
  target: targetSchema,
  sourceSuggestionId: z.string().nullable(),
  createdAt: z.string(),
});
export const boardSchema = z.object({
  schemaVersion: z.literal(3),
  boardId: id,
  revision: z.number().int().nonnegative(),
  title: short,
  sections: z.array(sectionSchema).max(100),
  suggestions: z.array(suggestionSchema).max(2000),
  memories: z.array(memorySchema).max(2000),
  focus: z.object({
    visible: z.boolean(),
    limit: z.union([z.literal(1), z.literal(3), z.literal(5)]),
    cardIds: z.array(id).max(5),
  }),
  whereStopped: text,
  agent: z.object({
    id: z.string().nullable(),
    skills: z.array(short).max(30),
    endOfConversation: z.boolean(),
  }),
  receipts: z.record(z.string(), z.string()),
  skills: z.array(skillVersionSchema).max(500),
  selectedSkillVersionIds: z.array(id).max(30),
  sessions: z.array(sessionSchema).max(2000),
  currentSessionId: z.string().nullable(),
  relations: z.array(relationSchema).max(2000).optional(),
  sources: z.array(sourceSchema).max(2000).optional(),
});
export const v2BoardSchema = boardSchema.omit({ relations: true, sources: true }).extend({ schemaVersion: z.literal(2) });
export const legacyBoardSchema = boardSchema
  .omit({
    schemaVersion: true,
    skills: true,
    selectedSkillVersionIds: true,
    sessions: true,
    currentSessionId: true,
  })
  .extend({ schemaVersion: z.literal(1) });
export function parseBoard(raw: unknown): Board {
  const legacy = legacyBoardSchema.safeParse(raw);
  const board = legacy.success
    ? boardSchema.parse({
        ...legacy.data,
        schemaVersion: 3,
        skills: [],
        selectedSkillVersionIds: [],
        sessions: [],
        currentSessionId: null,
      })
    : v2BoardSchema.safeParse(raw).success
      ? boardSchema.parse({ ...v2BoardSchema.parse(raw), schemaVersion: 3 })
      : boardSchema.parse(raw);
  validateBoardIntegrity(board);
  return board;
}
export function validateBoardIntegrity(board: Board) {
  const unique = (values: string[]) => { if (new Set(values).size !== values.length) throw new Error("Duplicate IDs in board."); };
  const nodes = board.sections.flatMap(s => [s.id, ...s.cards.map(c => c.id)]);
  unique(nodes); unique(board.suggestions.map(s => s.id)); unique((board.sources || []).map(s => s.id)); unique((board.relations || []).map(r => r.id));
  const nodeIds = new Set(nodes), sourceIds = new Set((board.sources || []).map(s => s.id));
  if (board.relations?.some(r => !nodeIds.has(r.fromId) || !nodeIds.has(r.toId))) throw new Error("Relation endpoint missing from board.");
  if (board.sections.some(s => s.cards.some(c => c.sourceIds?.some(id => !sourceIds.has(id))))) throw new Error("Card source missing from board.");
  for (const suggestion of board.suggestions) {
    if (suggestion.kind !== "map_draft") continue;
    if (!suggestion.mapDraft) throw new Error("Map draft payload required.");
    const draft = suggestion.mapDraft;
    const draftNodes = draft.sections.flatMap(s => [s.id, ...s.cards.map(c => c.id)]);
    unique(draftNodes); unique(draft.sources.map(s => s.id)); unique(draft.relations.map(r => r.id));
    // Draft references may become stale after a human deletes confirmed content.
    // map.apply validates/prunes references against the selected current content.
  }
}
export type Board = z.infer<typeof boardSchema>;
export type Card = z.infer<typeof cardSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type Target = z.infer<typeof targetSchema>;
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("suggestion.batch"), suggestions: z.array(suggestionSchema).max(30) }),
  z.object({ type: z.literal("relation.save"), relation: relationSchema }),
  z.object({ type: z.literal("relation.delete"), id }),
  z.object({ type: z.literal("source.save"), source: sourceSchema }),
  z.object({ type: z.literal("source.delete"), id }),
  z.object({ type: z.literal("map.apply"), suggestionId: id,
    sectionIds: z.array(id).max(100), cardIds: z.array(id).max(5000),
    relationIds: z.array(id).max(2000), sourceIds: z.array(id).max(2000) }),
  z.object({
    type: z.literal("title"),
    title: short,
    sourceSuggestionId: z.string().optional(),
  }),
  z.object({
    type: z.literal("section.save"),
    section: sectionSchema,
    sourceSuggestionId: z.string().optional(),
  }),
  z.object({ type: z.literal("section.delete"), id }),
  z.object({
    type: z.literal("section.move"),
    id,
    direction: z.enum(["up", "down"]),
  }),
  z.object({
    type: z.literal("card.save"),
    sectionId: id,
    card: cardSchema,
    sourceSuggestionId: z.string().optional(),
  }),
  z.object({ type: z.literal("card.delete"), id }),
  z.object({
    type: z.literal("card.move"),
    id,
    direction: z.enum(["up", "down"]),
    sectionId: id,
  }),
  z.object({
    type: z.literal("focus"),
    visible: z.boolean(),
    limit: z.union([z.literal(1), z.literal(3), z.literal(5)]),
    cardIds: z.array(id).max(5),
  }),
  z.object({
    type: z.literal("whereStopped"),
    text,
    sourceSuggestionId: z.string().optional(),
  }),
  z.object({
    type: z.literal("agent"),
    id: z.string().nullable(),
    skills: z.array(short).max(30),
    endOfConversation: z.boolean(),
  }),
  z.object({
    type: z.literal("suggestion.submit"),
    suggestion: suggestionSchema,
  }),
  z.object({
    type: z.literal("suggestion.status"),
    id,
    status: z.enum(["kept", "discarded", "incorporated"]),
  }),
  z.object({ type: z.literal("memory.save"), memory: memorySchema }),
  z.object({ type: z.literal("memory.delete"), id }),
  z.object({
    type: z.literal("structure.apply"),
    items: z.array(structureItemSchema.extend({ id })).max(30),
    suggestionId: z.string().optional(),
  }),
  z.object({
    type: z.literal("skill.register"),
    version: skillVersionSchema,
    sourceSuggestionId: z.string().optional(),
  }),
  z.object({
    type: z.literal("skill.select"),
    versionIds: z.array(id).max(30),
  }),
  z.object({ type: z.literal("session.start"), session: sessionSchema }),
  z.object({
    type: z.literal("conversation.start"),
    title: z.string().trim().min(1).max(500),
    session: sessionSchema,
  }),
  z.object({
    type: z.literal("conversation.delivery"),
    sessionId: id,
    state: z.enum(["attempted", "sent"]),
  }),
  z.object({
    type: z.literal("session.grilling"),
    sessionId: id,
    state: z.enum(["running", "paused", "off"]),
  }),
  z.object({ type: z.literal("session.closing"), sessionId: id }),
  z.object({
    type: z.literal("session.confirm"),
    sessionId: id,
    closedAt: z.string(),
    summary: text,
    whereStopped: text,
    decisions: z.array(memorySchema).max(30),
    suggestionId: z.string().optional(),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function emptyBoard(boardId: string): Board {
  return {
    schemaVersion: 3,
    boardId,
    revision: 0,
    title: "Business Harness",
    sections: [],
    suggestions: [],
    memories: [],
    focus: { visible: true, limit: 3, cardIds: [] },
    whereStopped: "",
    agent: { id: null, skills: [], endOfConversation: false },
    receipts: {},
    skills: [],
    selectedSkillVersionIds: [],
    sessions: [],
    currentSessionId: null,
  };
}
export function makeId(prefix = "item"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function move<T extends { id: string }>(
  items: T[],
  id: string,
  direction: "up" | "down",
) {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("Item não encontrado.");
  const j = i + (direction === "up" ? -1 : 1);
  if (j >= 0 && j < items.length) [items[i], items[j]] = [items[j], items[i]];
}
export function hasTarget(board: Board, target: Target): boolean {
  return target.kind === "board"
    ? target.id === board.boardId
    : target.kind === "section"
      ? board.sections.some((s) => s.id === target.id)
      : board.sections.some((s) => s.cards.some((c) => c.id === target.id));
}
export function reduceBoard(board: Board, raw: Command): Board {
  const cmd = commandSchema.parse(raw);
  const b: Board = JSON.parse(JSON.stringify(board));
  const section = (id: string) => {
    const s = b.sections.find((s) => s.id === id);
    if (!s) throw new Error("Área não encontrada.");
    return s;
  };
  switch (cmd.type) {
    case "suggestion.batch": {
      const revision = b.revision;
      for (const suggestion of cmd.suggestions) Object.assign(b, reduceBoard(b, { type: "suggestion.submit", suggestion }));
      b.revision = revision;
      break;
    }
    case "relation.save": {
      const ids = new Set(b.sections.flatMap(s => [s.id, ...s.cards.map(c => c.id)]));
      if (!ids.has(cmd.relation.fromId) || !ids.has(cmd.relation.toId)) throw new Error("Relation endpoint missing.");
      b.relations = [...(b.relations || []).filter(r => r.id !== cmd.relation.id), cmd.relation];
      break;
    }
    case "relation.delete": b.relations = (b.relations || []).filter(r => r.id !== cmd.id); break;
    case "source.save": b.sources = [...(b.sources || []).filter(s => s.id !== cmd.source.id), cmd.source]; break;
    case "source.delete":
      b.sources = (b.sources || []).filter(s => s.id !== cmd.id);
      b.sections.forEach(s => s.cards.forEach(c => { if (c.sourceIds) c.sourceIds = c.sourceIds.filter(id => id !== cmd.id); }));
      break;
    case "map.apply": {
      const suggestion = b.suggestions.find(s => s.id === cmd.suggestionId);
      if (!suggestion || suggestion.kind !== "map_draft" || !suggestion.mapDraft || suggestion.status === "discarded") throw new Error("Map proposal missing.");
      const draft = suggestion.mapDraft;
      const select = (selected: string[], available: {id: string}[]) => {
        if (selected.some(id => !available.some(x => x.id === id))) throw new Error("Selection is outside proposal.");
        return new Set(selected);
      };
      const sections = select(cmd.sectionIds, draft.sections);
      const cards = select(cmd.cardIds, draft.sections.flatMap(s => s.cards));
      const relations = select(cmd.relationIds, draft.relations);
      const sources = select(cmd.sourceIds, draft.sources);
      const existing = new Set(b.sections.flatMap(s => [s.id, ...s.cards.map(c => c.id)]));
      for (const s of draft.sections) {
        const picked = s.cards.filter(c => cards.has(c.id));
        if (!sections.has(s.id) && picked.length) throw new Error("Select the parent section for selected cards.");
        if (!sections.has(s.id)) continue;
        const prior = b.sections.find(x => x.id === s.id);
        if (!prior && existing.has(s.id)) throw new Error("Proposal ID collision.");
        // Repeated partial acceptance may add cards, but never replace human content.
        if (prior && prior.sourceSuggestionId !== suggestion.id) throw new Error("Proposal cannot overwrite an existing section.");
        const dest = prior || { ...s, sourceSuggestionId: suggestion.id, cards: [] };
        if (!prior) { b.sections.push(dest); existing.add(s.id); }
        for (const c of picked) {
          if (existing.has(c.id)) {
            if (dest.cards.some(x => x.id === c.id && x.sourceSuggestionId === suggestion.id)) continue;
            throw new Error("Proposal cannot overwrite an existing card.");
          }
          dest.cards.push({ ...c, lane: "later", important: false, urgent: false, done: false, sourceSuggestionId: suggestion.id, sourceIds: c.sourceIds?.filter(id => sources.has(id) || b.sources?.some(x => x.id === id)) });
          existing.add(c.id);
        }
      }
      for (const source of draft.sources.filter(s => sources.has(s.id))) {
        const prior = b.sources?.find(s => s.id === source.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(source)) throw new Error("Source ID collision.");
        if (!prior) (b.sources ??= []).push(source);
      }
      for (const relation of draft.relations.filter(r => relations.has(r.id))) {
        if (!existing.has(relation.fromId) || !existing.has(relation.toId)) continue;
        const prior = b.relations?.find(r => r.id === relation.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(relation)) throw new Error("Relation ID collision.");
        if (!prior) (b.relations ??= []).push(relation);
      }
      const acceptedNodes = new Set(b.sections.flatMap(s => [s.id, ...s.cards.map(c => c.id)]));
      const complete = draft.sections.every(s => acceptedNodes.has(s.id) && s.cards.every(c => acceptedNodes.has(c.id)))
        && draft.sources.every(s => b.sources?.some(x => x.id === s.id))
        && draft.relations.every(r => b.relations?.some(x => x.id === r.id));
      suggestion.status = complete ? "incorporated" : "pending";
      break;
    }
    case "title":
      b.title = cmd.title;
      break;
    case "section.save": {
      const i = b.sections.findIndex((s) => s.id === cmd.section.id);
      const saved = { ...cmd.section };
      delete saved.sourceSuggestionId;
      const origin =
        i < 0 ? cmd.sourceSuggestionId : b.sections[i].sourceSuggestionId;
      if (origin) saved.sourceSuggestionId = origin;
      if (i < 0)
        b.sections.push({
          ...saved,
          cards: saved.cards.map((card) => {
            const clean = { ...card };
            delete clean.sourceSuggestionId;
            return clean;
          }),
        });
      else b.sections[i] = { ...saved, cards: b.sections[i].cards };
      break;
    }
    case "section.delete":
      section(cmd.id);
      b.sections = b.sections.filter((s) => s.id !== cmd.id);
      break;
    case "section.move":
      move(b.sections, cmd.id, cmd.direction);
      break;
    case "card.save": {
      const s = section(cmd.sectionId);
      const elsewhere = b.sections.find(
        (x) => x.id !== s.id && x.cards.some((c) => c.id === cmd.card.id),
      );
      if (elsewhere) throw new Error("ID de card já existe em outra área.");
      const i = s.cards.findIndex((c) => c.id === cmd.card.id);
      const saved = { ...cmd.card };
      delete saved.sourceSuggestionId;
      const origin =
        i < 0 ? cmd.sourceSuggestionId : s.cards[i].sourceSuggestionId;
      if (origin) saved.sourceSuggestionId = origin;
      if (i < 0) s.cards.push(saved);
      else s.cards[i] = saved;
      break;
    }
    case "card.delete":
      if (!b.sections.some((s) => s.cards.some((c) => c.id === cmd.id)))
        throw new Error("Card não encontrado.");
      b.sections.forEach((s) => {
        s.cards = s.cards.filter((c) => c.id !== cmd.id);
      });
      break;
    case "card.move": {
      const source = b.sections.find((s) =>
        s.cards.some((c) => c.id === cmd.id),
      );
      if (!source) throw new Error("Card não encontrado.");
      const dest = section(cmd.sectionId);
      if (source.id === dest.id) move(source.cards, cmd.id, cmd.direction);
      else {
        const c = source.cards.find((c) => c.id === cmd.id)!;
        source.cards = source.cards.filter((c) => c.id !== cmd.id);
        dest.cards.push(c);
      }
      break;
    }
    case "focus":
      if (
        cmd.cardIds.some(
          (id) => !b.sections.some((s) => s.cards.some((c) => c.id === id)),
        )
      )
        throw new Error("Foco aponta para card inexistente.");
      b.focus = {
        visible: cmd.visible,
        limit: cmd.limit,
        cardIds: [...new Set(cmd.cardIds)].slice(0, cmd.limit),
      };
      break;
    case "whereStopped":
      b.whereStopped = cmd.text;
      break;
    case "agent":
      if (cmd.id !== b.agent.id && cmd.id && b.currentSessionId)
        throw new Error("Encerre a sessão atual antes de trocar o agente.");
      b.agent = {
        id: cmd.id,
        skills: cmd.skills,
        endOfConversation: cmd.endOfConversation,
      };
      break;
    case "suggestion.submit":
      if (!hasTarget(b, cmd.suggestion.target))
        throw new Error("Alvo da sugestão não pertence ao board.");
      if (b.suggestions.some((s) => s.id === cmd.suggestion.id))
        throw new Error("Sugestão duplicada.");
      if (
        cmd.suggestion.sessionId &&
        !b.sessions.some(
          (s) =>
            s.id === cmd.suggestion.sessionId &&
            s.agentId === cmd.suggestion.sourceAgentId,
        )
      )
        throw new Error("Sessão da sugestão não pertence ao agente.");
      b.suggestions.push(cmd.suggestion);
      break;
    case "skill.register": {
      if (!b.skills.some((s) => s.id === cmd.version.id))
        b.skills.push(cmd.version);
      if (cmd.sourceSuggestionId) {
        const suggestion = b.suggestions.find(
          (s) => s.id === cmd.sourceSuggestionId,
        );
        if (
          !suggestion ||
          !["skill_import", "skill_adjustment"].includes(suggestion.kind)
        )
          throw new Error("Sugestão de skill não encontrada.");
        suggestion.status = "incorporated";
      }
      break;
    }
    case "skill.select": {
      if (cmd.versionIds.some((id) => !b.skills.some((s) => s.id === id)))
        throw new Error("Versão de skill não importada.");
      b.selectedSkillVersionIds = [...new Set(cmd.versionIds)];
      const session = b.sessions.find(
        (s) => s.id === b.currentSessionId && s.status !== "closed",
      );
      if (session) {
        session.initialSkillVersionIds ??= [...session.skillVersionIds];
        session.skillVersionIds = [...b.selectedSkillVersionIds];
      }
      break;
    }
    case "conversation.delivery": {
      if (!b.sessions.some((s) => s.id === cmd.sessionId))
        throw new Error("Sessão não encontrada.");
      b.receipts[`conversation.delivery:${cmd.sessionId}`] = cmd.state;
      break;
    }
    case "conversation.start":
    case "session.start": {
      if (
        b.currentSessionId &&
        b.sessions.some(
          (s) => s.id === b.currentSessionId && s.status !== "closed",
        )
      )
        throw new Error("Encerre a sessão atual antes de iniciar outra.");
      if (cmd.type === "conversation.start") {
        b.title = cmd.title;
        b.agent.id = cmd.session.agentId;
        b.selectedSkillVersionIds = [...new Set(cmd.session.skillVersionIds)];
      }
      if (
        cmd.session.agentId !== b.agent.id ||
        cmd.session.status !== "active" ||
        cmd.session.closedAt ||
        cmd.session.skillVersionIds.some(
          (id) => !b.skills.some((s) => s.id === id),
        )
      )
        throw new Error("Agente ou versões da sessão inválidos.");
      if (b.sessions.some((s) => s.id === cmd.session.id))
        throw new Error("Sessão duplicada.");
      b.sessions.push({
        ...cmd.session,
        initialSkillVersionIds: [...cmd.session.skillVersionIds],
      });
      b.currentSessionId = cmd.session.id;
      break;
    }
    case "session.grilling": {
      const session = b.sessions.find((s) => s.id === cmd.sessionId);
      if (!session || session.status !== "active")
        throw new Error("Sessão não está ativa.");
      session.grilling = cmd.state;
      break;
    }
    case "session.closing": {
      const session = b.sessions.find((s) => s.id === cmd.sessionId);
      if (!session || session.status === "closed")
        throw new Error("Sessão não está aberta.");
      session.status = "closing";
      session.grilling = "paused";
      break;
    }
    case "session.confirm": {
      const session = b.sessions.find((s) => s.id === cmd.sessionId);
      if (!session || session.status === "closed")
        throw new Error("Sessão não está aberta.");
      if (
        cmd.decisions.some(
          (m) =>
            !hasTarget(b, m.target) ||
            b.memories.some((existing) => existing.id === m.id),
        )
      )
        throw new Error("Decisão da sessão inválida.");
      if (cmd.suggestionId) {
        const suggestion = b.suggestions.find((s) => s.id === cmd.suggestionId);
        if (
          !suggestion ||
          suggestion.kind !== "session_summary" ||
          suggestion.sessionId !== session.id
        )
          throw new Error("Resumo candidato não pertence à sessão.");
        suggestion.status = "incorporated";
        session.summarySuggestionId = suggestion.id;
      }
      b.memories.push(...cmd.decisions);
      b.whereStopped = cmd.whereStopped;
      session.status = "closed";
      session.closedAt = cmd.closedAt;
      session.summary = cmd.summary;
      session.grilling = "off";
      if (b.currentSessionId === session.id) b.currentSessionId = null;
      break;
    }
    case "suggestion.status": {
      const s = b.suggestions.find((s) => s.id === cmd.id);
      if (!s) throw new Error("Sugestão não encontrada.");
      s.status = cmd.status;
      break;
    }
    case "memory.save":
      if (!hasTarget(b, cmd.memory.target))
        throw new Error("Alvo da memória não pertence ao board.");
      {
        const i = b.memories.findIndex((m) => m.id === cmd.memory.id);
        if (i < 0) b.memories.push(cmd.memory);
        else {
          // Editing confirmed content preserves its original provenance and date.
          cmd.memory.createdAt = b.memories[i].createdAt;
          cmd.memory.sourceSuggestionId = b.memories[i].sourceSuggestionId;
          b.memories[i] = cmd.memory;
        }
        if (cmd.memory.sourceSuggestionId) {
          const s = b.suggestions.find(
            (s) => s.id === cmd.memory.sourceSuggestionId,
          );
          if (!s || !["memory", "session_summary"].includes(s.kind))
            throw new Error("Sugestão de memória não encontrada.");
          s.status = "incorporated";
        }
      }
      break;
    case "memory.delete":
      b.memories = b.memories.filter((m) => m.id !== cmd.id);
      break;
    case "structure.apply":
      if (cmd.items.some((i) => b.sections.some((s) => s.id === i.id)))
        throw new Error("ID de área duplicado.");
      b.sections.push(
        ...cmd.items.map((i) => ({
          ...i,
          cards: [],
          ...(cmd.suggestionId ? { sourceSuggestionId: cmd.suggestionId } : {}),
        })),
      );
      if (cmd.suggestionId) {
        const s = b.suggestions.find((s) => s.id === cmd.suggestionId);
        if (!s || s.kind !== "structure")
          throw new Error("Prévia não encontrada.");
        s.status = "incorporated";
      }
      break;
  }
  if (
    cmd.type !== "skill.register" &&
    "sourceSuggestionId" in cmd &&
    cmd.sourceSuggestionId
  ) {
    const s = b.suggestions.find((s) => s.id === cmd.sourceSuggestionId);
    if (
      !s ||
      !(
        s.kind === "insight" ||
        (cmd.type === "card.save" && s.kind === "card_draft")
      )
    )
      throw new Error("Insight de origem não encontrado.");
    s.status = "incorporated";
  }
  const allIds = b.sections.flatMap((s) => [s.id, ...s.cards.map((c) => c.id)]);
  const remaining = new Set(allIds);
  if (b.relations) b.relations = b.relations.filter(r => remaining.has(r.fromId) && remaining.has(r.toId));
  if (new Set(allIds).size !== allIds.length)
    throw new Error("IDs duplicados.");
  b.focus.cardIds = b.focus.cardIds
    .filter((id) =>
      b.sections.some((s) => s.cards.some((c) => c.id === id && !c.done)),
    )
    .slice(0, b.focus.limit);
  b.revision++;
  const parsed = boardSchema.parse(b);
  validateBoardIntegrity(parsed);
  return parsed;
}
