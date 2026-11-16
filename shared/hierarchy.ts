import type { Board, Card, Section } from './model'

/** The business itself is level one; every area or card adds one level. */
export const MAX_HIERARCHY_DEPTH = 5
export type HierarchyNode = {
  id: string
  kind: 'board' | 'section' | 'card'
  title: string
  section?: Section
  card?: Card
}
type HierarchyBoard = Pick<Board, 'boardId' | 'title' | 'sections'>

function index(board: HierarchyBoard) {
  const nodes = new Map<string, HierarchyNode>([[board.boardId, { id: board.boardId, kind: 'board', title: board.title }]])
  const parents = new Map<string, string>()
  for (const section of board.sections) {
    if (nodes.has(section.id)) throw new Error('IDs duplicados na hierarquia do plano.')
    nodes.set(section.id, { id: section.id, kind: 'section', title: section.title, section })
    parents.set(section.id, section.parentId ?? board.boardId)
    for (const card of section.cards) {
      if (nodes.has(card.id)) throw new Error('IDs duplicados na hierarquia do plano.')
      nodes.set(card.id, { id: card.id, kind: 'card', title: card.title, section, card })
      parents.set(card.id, section.id)
    }
  }
  return { nodes, parents }
}

export function getNode(board: HierarchyBoard, nodeId: string): HierarchyNode | undefined {
  return index(board).nodes.get(nodeId)
}
export function getParent(board: HierarchyBoard, nodeId: string): HierarchyNode | undefined {
  const { nodes, parents } = index(board)
  const parentId = parents.get(nodeId)
  return parentId === undefined ? undefined : nodes.get(parentId)
}
export function getChildren(board: HierarchyBoard, nodeId: string): HierarchyNode[] {
  const { nodes, parents } = index(board)
  if (!nodes.has(nodeId)) return []
  return [...nodes.values()].filter(node => parents.get(node.id) === nodeId)
}
/** Includes the business and the focused node. A missing target has no path. */
export function getPath(board: HierarchyBoard, nodeId: string): HierarchyNode[] {
  const { nodes, parents } = index(board)
  if (!nodes.has(nodeId)) return []
  const path: HierarchyNode[] = []
  const visited = new Set<string>()
  let current: string | undefined = nodeId
  while (current !== undefined) {
    if (visited.has(current)) throw new Error('A hierarquia contém um ciclo: uma área ou card não pode ser ancestral de si mesmo.')
    visited.add(current)
    const node = nodes.get(current)
    if (!node) throw new Error('Área ou card pai não encontrado na hierarquia.')
    path.unshift(node)
    current = parents.get(current)
  }
  return path
}
export function getDepth(board: HierarchyBoard, nodeId: string): number | undefined {
  const path = getPath(board, nodeId)
  return path.length || undefined
}

/** Validate actual ownership too: a card cannot become its own area's ancestor. */
export function validateHierarchy(board: HierarchyBoard): void {
  const { nodes, parents } = index(board)
  const depths = new Map<string, number>([[board.boardId, 1]])
  for (const id of nodes.keys()) {
    const pending: string[] = []
    const visited = new Set<string>()
    let current = id
    while (!depths.has(current)) {
      if (visited.has(current)) throw new Error('A hierarquia contém um ciclo: uma área ou card não pode ser ancestral de si mesmo.')
      if (!nodes.has(current)) throw new Error('Área ou card pai não encontrado na hierarquia.')
      visited.add(current)
      pending.push(current)
      const parentId = parents.get(current)
      if (parentId === undefined) throw new Error('Área ou card pai não encontrado na hierarquia.')
      current = parentId
    }
    let depth = depths.get(current)!
    for (const childId of pending.reverse()) {
      if (++depth > MAX_HIERARCHY_DEPTH) throw new Error(`O plano pode ter no máximo ${MAX_HIERARCHY_DEPTH} níveis, contando o negócio.`)
      depths.set(childId, depth)
    }
  }
}

/** Inclusive subtree IDs, used to make deletion safe for both parent kinds. */
export function getSubtreeIds(board: HierarchyBoard, nodeId: string): Set<string> {
  const { nodes, parents } = index(board)
  const children = new Map<string, string[]>()
  for (const [id, parentId] of parents) {
    const siblings = children.get(parentId) ?? []
    siblings.push(id)
    children.set(parentId, siblings)
  }
  const result = new Set<string>()
  const pending = nodes.has(nodeId) ? [nodeId] : []
  while (pending.length) {
    const current = pending.pop()!
    if (result.has(current)) continue
    result.add(current)
    pending.push(...(children.get(current) ?? []))
  }
  return result
}
