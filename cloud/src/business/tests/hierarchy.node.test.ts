import { describe, expect, test } from 'vitest'
import { emptyBoard, parseBoard, reduceBoard, type Board, type Card, type Section, type Suggestion } from '../../../../shared/model'
import { getChildren, getDepth, getNode, getParent, getPath, MAX_HIERARCHY_DEPTH } from '../../../../shared/hierarchy'
import { applyBatch, canonicalJSON, importPortableBoard, newBoard } from '../domain'
import { exportMarkdown } from '../../../../shared/export'

const card = (id: string): Card => ({ id, title: id, text: '', firstStep: '', lane: 'now', done: false, important: false, urgent: false })
const section = (id: string, parentId?: string, cards: Card[] = []): Section => ({ id, title: id, questions: '', cards, ...(parentId ? { parentId } : {}) })
function tree(): Board {
  return parseBoard({ ...emptyBoard('business'), sections: [section('market', undefined, [card('customers')]), section('research', 'customers', [card('interview')]), section('operations')] })
}

describe('business focus hierarchy', () => {
  test('keeps existing root areas and cards, with an inclusive ancestor path through both node kinds', () => {
    const board = tree()
    expect(getNode(board, 'business')).toEqual({ id: 'business', title: board.title, kind: 'board' })
    expect(getNode(board, 'research')?.section).toBe(board.sections[1])
    expect(getNode(board, 'interview')?.card).toBe(board.sections[1].cards[0])
    expect(getChildren(board, 'business').map(n => n.id)).toEqual(['market', 'operations'])
    expect(getChildren(board, 'market').map(n => n.id)).toEqual(['customers'])
    expect(getChildren(board, 'customers').map(n => n.id)).toEqual(['research'])
    expect(getParent(board, 'interview')?.id).toBe('research')
    expect(getParent(board, 'business')).toBeUndefined()
    expect(getPath(board, 'interview').map(n => n.id)).toEqual(['business', 'market', 'customers', 'research', 'interview'])
    expect(getDepth(board, 'business')).toBe(1)
    expect(getDepth(board, 'interview')).toBe(MAX_HIERARCHY_DEPTH)
    expect(getPath(board, 'missing')).toEqual([])
    expect(getDepth(board, 'missing')).toBeUndefined()
    expect(getChildren(board, 'missing')).toEqual([])
  })

  test('rejects missing parents, self and multi-area cycles, implicit-card cycles, and IDs colliding with the business', () => {
    for (const sections of [
      [section('a', 'missing')],
      [section('a', 'a')],
      [section('a', 'b'), section('b', 'a')],
      [section('a', 'owned-card', [card('owned-card')])],
      [section('a', 'descendant-card'), section('b', 'a', [card('descendant-card')])],
      [section('business')],
    ]) expect(() => parseBoard({ ...emptyBoard('business'), sections })).toThrow(/hierarquia/)
  })

  test('allows five total levels and atomically rejects adding a sixth or moving a parent beneath its descendant', () => {
    const before = tree()
    expect(() => applyBatch(before, [
      { type: 'title', title: 'Must roll back' },
      { type: 'section.save', section: section('too-deep', 'interview') },
    ], 0)).toThrow('5 níveis')
    expect(before.title).toBe('Business Harness')
    expect(before.sections).toHaveLength(3)
    expect(() => reduceBoard(before, { type: 'section.save', section: { ...before.sections[0], parentId: 'research' } })).toThrow('ciclo')
    expect(() => reduceBoard(before, { type: 'card.move', id: 'customers', sectionId: 'research', direction: 'down' })).toThrow('ciclo')
    const deepArea = parseBoard({ ...emptyBoard('business'), sections: [section('a'), section('b', 'a'), section('c', 'b'), section('d', 'c')] })
    expect(getDepth(deepArea, 'd')).toBe(5)
    expect(() => reduceBoard(deepArea, { type: 'card.save', sectionId: 'd', card: card('six') })).toThrow('5 níveis')
  })

  test('moving a card preserves its child areas, but rejects depth overflow of any descendant', () => {
    const before = tree()
    const moved = reduceBoard(before, { type: 'card.move', id: 'customers', sectionId: 'operations', direction: 'down' })
    expect(getPath(moved, 'interview').map(n => n.id)).toEqual(['business', 'operations', 'customers', 'research', 'interview'])
    const extended = reduceBoard(before, { type: 'section.save', section: section('nested-destination', 'operations') })
    expect(() => reduceBoard(extended, { type: 'card.move', id: 'customers', sectionId: 'nested-destination', direction: 'down' })).toThrow('5 níveis')
    expect(getParent(extended, 'customers')?.id).toBe('market')
  })

  test('deleting either parent kind cascades exactly its subtree and prunes focus and relations', () => {
    const before = tree()
    before.focus.cardIds = ['interview']
    before.relations = [{ id: 'r1', fromId: 'operations', toId: 'research', label: 'related' }]
    const cardDeleted = reduceBoard(before, { type: 'card.delete', id: 'customers' })
    expect(cardDeleted.sections.map(s => s.id)).toEqual(['market', 'operations'])
    expect(cardDeleted.sections[0].cards).toEqual([])
    expect(cardDeleted.focus.cardIds).toEqual([])
    expect(cardDeleted.relations).toEqual([])
    const areaDeleted = reduceBoard(before, { type: 'section.delete', id: 'market' })
    expect(areaDeleted.sections.map(s => s.id)).toEqual(['operations'])
    expect(areaDeleted.focus.cardIds).toEqual([])
    expect(before.sections).toHaveLength(3)
    expect(before.focus.cardIds).toEqual(['interview'])
  })

  test('structure and section commands preserve arbitrary parent areas without imposing a methodology', () => {
    const before = applyBatch(newBoard('business'), [{ type: 'structure.apply', items: [
      { id: 'custom', title: 'My own framework', questions: '' },
      { id: 'custom-child', title: 'My area', questions: '', parentId: 'custom' },
    ] }], 0)
    expect(before.sections[1].parentId).toBe('custom')
    const after = applyBatch(before, [{ type: 'section.save', section: { ...before.sections[1], parentId: undefined } }], 1)
    expect(getDepth(after, 'custom-child')).toBe(2)
    expect(() => applyBatch(after, [{ type: 'title', title: 'stale' }], 1)).toThrow('CONFLICT')
  })

  test('map drafts retain hierarchy and partial acceptance requires every missing ancestor', () => {
    const before = emptyBoard('business')
    const suggestion: Suggestion = {
      id: 'proposal', requestId: 'request', kind: 'map_draft', title: 'Custom map', text: '', rationale: '',
      target: { kind: 'board', id: 'business' }, structure: [], sourceAgentId: 'agent', baseRevision: 0,
      createdAt: '2026-11-16', status: 'pending', stale: false,
      mapDraft: { sections: [section('parent', undefined, [card('anchor')]), section('child', 'anchor')], relations: [], sources: [] },
    }
    const proposed = reduceBoard(before, { type: 'suggestion.submit', suggestion })
    expect(proposed.sections).toEqual([])
    expect(proposed.suggestions[0].mapDraft?.sections[1].parentId).toBe('anchor')
    const command = { type: 'map.apply' as const, suggestionId: 'proposal', sectionIds: ['child'], cardIds: [], relationIds: [], sourceIds: [] }
    expect(() => reduceBoard(proposed, command)).toThrow('pai não encontrado')
    expect(proposed.sections).toEqual([])
    const after = reduceBoard(proposed, { ...command, sectionIds: ['parent', 'child'], cardIds: ['anchor'] })
    expect(getDepth(after, 'child')).toBe(4)
    expect(after.suggestions[0].status).toBe('incorporated')
  })

  test('schema 3 JSON import and undo-style snapshots preserve hierarchy; legacy flat data stays unchanged', () => {
    const before = tree()
    const imported = importPortableBoard(JSON.parse(JSON.stringify(before)))
    expect(imported.schemaVersion).toBe(3)
    expect(imported.sections).toEqual(before.sections)
    const snapshot = canonicalJSON(before)
    reduceBoard(before, { type: 'section.delete', id: 'market' })
    expect(parseBoard(JSON.parse(snapshot)).sections).toEqual(before.sections)
    const legacy = emptyBoard('flat')
    legacy.sections = [section('a', undefined, [card('b')])]
    expect(parseBoard(legacy)).toEqual(legacy)
    expect('parentId' in parseBoard(legacy).sections[0]).toBe(false)
  })

  test('Markdown records nested area paths while preserving existing flat area output', () => {
    const board = tree()
    expect(exportMarkdown(board)).toContain('## research\n\nCaminho: Business Harness > market > customers > research\n\n')
    const flat = { ...emptyBoard('flat'), title: 'My business', sections: [section('area')] }
    const markdown = exportMarkdown(flat)
    expect(markdown).toContain('## area\n\n\n')
    expect(markdown).not.toContain('Caminho:')
    expect(exportMarkdown({ ...flat, sections: [{ ...flat.sections[0], parentId: flat.boardId }] })).toBe(markdown)
  })
})
