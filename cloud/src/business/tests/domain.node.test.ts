import { describe, expect, test } from 'vitest'
import { emptyBoard, type Board } from '../../../../shared/model'
import { applyBatch, assertActor, boardChanges, canonicalJSON, createEventHeaders, importPortableBoard, newBoard, sha256, signCapability, verifyCapability, verifyEventHeaders } from '../domain'
import { changeCommandSchema, type Actor, type ApprovalCapability, type SkillPackageInput } from '../model'
import { validateSkillPackage } from '../skills'

const actor: Actor = { userId: 'person-1', businessId: 'business-1', channel: 'chatgpt', clientId: 'chatgpt-pilot', grantId: 'grant-1' }
const secret = 'a-test-secret-with-at-least-32-characters'
const section = { id: 'section-1', title: 'Clientes', questions: '', cards: [] }
describe('portable cloud domain', () => {
  test('batches increment one revision, preserve original, and fail atomically', () => {
    const before = newBoard('business-1')
    const after = applyBatch(before, [{ type: 'section.save', section }, { type: 'title', title: 'Nova empresa' }], 0)
    expect(after.revision).toBe(1)
    expect(after.sections).toHaveLength(1)
    expect(before.sections).toHaveLength(0)
    expect(() => applyBatch(before, [{ type: 'title', title: 'Should not persist' }, { type: 'card.delete', id: 'missing' }], 0)).toThrow()
    expect(before.title).toBe('Meu negócio')
    expect(() => applyBatch(after, [{ type: 'title', title: 'stale' }], 0)).toThrow('CONFLICT')
  })
  test('accepts only bounded human-editable commands and rejects runtime or injected commands', () => {
    for (const type of ['agent', 'session.start', 'session.confirm', 'conversation.start', 'suggestion.submit', 'suggestion.batch', 'skill.register']) expect(changeCommandSchema.safeParse({ type }).success).toBe(false)
    expect(changeCommandSchema.safeParse({ type: 'title', title: 'OK', agentId: 'injected' }).success).toBe(false)
    expect(() => applyBatch(newBoard('b'), [], 0)).toThrow()
    expect(() => applyBatch(newBoard('b'), Array.from({ length: 101 }, () => ({ type: 'title' as const, title: 'x' })), 0)).toThrow()
  })
  test('validates source references and prunes deleted relations/focus through the shared reducer', () => {
    const before = applyBatch(newBoard('b'), [{ type: 'section.save', section: { ...section, cards: [{ id: 'c1', title: 'One', text: '', firstStep: '', lane: 'now', done: false, important: false, urgent: false }] } }], 0)
    const linked = applyBatch(before, [{ type: 'focus', visible: true, limit: 1, cardIds: ['c1'] }, { type: 'relation.save', relation: { id: 'r1', fromId: 'section-1', toId: 'c1', label: 'supports' } }], 1)
    const after = applyBatch(linked, [{ type: 'card.delete', id: 'c1' }], 2)
    expect(after.focus.cardIds).toEqual([])
    expect(after.relations).toEqual([])
    expect(() => applyBatch(before, [{ type: 'card.save', sectionId: 'section-1', card: { ...before.sections[0].cards[0], sourceIds: ['unknown'] } }], 1)).toThrow()
  })
  test('owner assertions bind both user and business, and external actors require grant/client identity', () => {
    expect(assertActor(actor, { userId: 'person-1', businessId: 'business-1' })).toEqual(actor)
    expect(() => assertActor({ ...actor, userId: 'person-2' }, actor)).toThrow('FORBIDDEN')
    expect(() => assertActor({ ...actor, businessId: 'business-2' }, actor)).toThrow('FORBIDDEN')
    expect(() => assertActor({ userId: actor.userId, businessId: actor.businessId, channel: 'chatgpt' }, actor)).toThrow('FORBIDDEN')
  })
  test('imports schema 1, 2 and 3 as copies, keeps IDs/content, removes local runtime links and credential URL fields', () => {
    const original = emptyBoard('local-board')
    original.revision = 42
    original.agent.id = 'local-agent'
    original.receipts = { 'runtime-token': 'private' }
    original.sources = [{ id: 'local', kind: 'url', label: 'local', text: '', url: 'http://localhost:7777/?token=secret', createdAt: '2026-01-01' }]
    original.sessions = [{ id: 'session-1', objective: 'Research', agentId: 'local-agent', skillVersionIds: [], startedAt: '2026-01-01', closedAt: null, status: 'active', grilling: 'running', summary: '', summarySuggestionId: null }]
    original.currentSessionId = 'session-1'
    expect(canonicalJSON(importPortableBoard(original))).toBe(canonicalJSON(importPortableBoard(original)))
    expect(importPortableBoard(original).sessions[0].closedAt).toBe(original.sessions[0].startedAt)
    for (const schemaVersion of [1, 2, 3]) {
      const raw = { ...original, schemaVersion, credentials: { token: 'secret' } }
      const imported = importPortableBoard(raw)
      expect(imported.boardId).toBe('local-board')
      expect(imported.revision).toBe(1)
      expect(imported.agent.id).toBeNull()
      expect(imported.currentSessionId).toBeNull()
      expect(imported.receipts).toEqual({})
      expect('credentials' in imported).toBe(false)
      expect(imported.sources?.[0]?.url).toBeUndefined()
      if (schemaVersion !== 1) expect(imported.sessions[0].status).toBe('closed')
    }
    expect(original.agent.id).toBe('local-agent')
    expect(original.revision).toBe(42)
    expect(original.sessions[0].status).toBe('active')
  })
  test('preview comes from actual before/after and ignores revision noise', () => {
    const before = newBoard('b'), after = applyBatch(before, [{ type: 'title', title: 'Changed' }], 0)
    expect(boardChanges(before, after)).toEqual([{ path: '/title', before: 'Meu negócio', after: 'Changed' }])
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }))
  })
})
describe('approval capability', () => {
  const expected = { action: 'apply' as const, targetId: 'proposal-1', hash: 'batch-hash', baseRevision: 5 }
  const payload: ApprovalCapability = { version: 1, actor, ...expected, expiresAt: Date.now() + 60_000, nonce: 'one-use' }
  test('verifies signed exact actor, client, grant, action, proposal, hash and revision bindings', async () => {
    const signed = await signCapability(payload, secret)
    expect(await verifyCapability(signed, secret, actor, expected)).toEqual(payload)
    for (const altered of [{ ...actor, userId: 'other' }, { ...actor, businessId: 'other' }, { ...actor, grantId: 'other' }, { ...actor, clientId: 'other' }]) await expect(verifyCapability(signed, secret, altered, expected)).rejects.toThrow('FORBIDDEN')
    for (const altered of [{ ...expected, action: 'reject' as const }, { ...expected, targetId: 'other' }, { ...expected, hash: 'other' }, { ...expected, baseRevision: 6 }]) await expect(verifyCapability(signed, secret, actor, altered)).rejects.toThrow('FORBIDDEN')
    const [body, signature] = signed.split('.')
    await expect(verifyCapability(`${body}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`, secret, actor, expected)).rejects.toThrow('FORBIDDEN')
  })
  test('rejects expiry, excessive lifetime, malformed tokens and insufficient signing secrets', async () => {
    for (const expiresAt of [Date.now() - 1, Date.now() + 301_000]) {
      await expect(verifyCapability(await signCapability({ ...payload, expiresAt }, secret), secret, actor, expected)).rejects.toThrow('EXPIRED')
    }
    await expect(verifyCapability('bad.token', secret, actor, expected)).rejects.toThrow('FORBIDDEN')
    await expect(signCapability(payload, 'short')).rejects.toThrow()
  })
  test('event subscription proofs bind actor, expire after 30 seconds, and cannot be reused as approvals', async () => {
    const signed = await createEventHeaders(actor, secret)
    expect(await verifyEventHeaders(new Headers(signed), secret)).toEqual(actor)
    await expect(verifyEventHeaders(new Headers(signed), secret, Date.now() + 31_000)).rejects.toThrow('FORBIDDEN')
    await expect(verifyEventHeaders(new Headers({ ...signed, 'x-business-actor': 'tampered' }), secret)).rejects.toThrow('FORBIDDEN')
    await expect(verifyCapability(signed['x-business-signature'], secret, actor, expected)).rejects.toThrow('FORBIDDEN')
  })
})
export async function exampleSkill(): Promise<SkillPackageInput> {
  const content = '---\nname: Research\ndescription: A private reference\n---\n# Research\nRead evidence.'
  const files = [{ path: 'SKILL.md', size: new TextEncoder().encode(content).length, sha256: await sha256(content), encoding: 'utf8' as const }]
  const treeHash = await sha256(JSON.stringify(files))
  return { version: { id: `skill-0123456789abcdef0123@${treeHash}`, skillId: 'skill-0123456789abcdef0123', treeHash, name: 'Research', description: 'Reference', files, sourcePath: 'C:\\private\\skill', sourceUrl: '', createdAt: '2026-01-01', parentVersionId: null, originalVersionId: null, rationale: '', diff: '' }, files: [{ path: 'SKILL.md', encoding: 'utf8', content }] }
}
describe('immutable skill packages', () => {
  test('validates exact manifest bytes/hash and removes active local source path', async () => {
    const input = await exampleSkill()
    const valid = await validateSkillPackage(input)
    expect(valid.version.sourcePath).toBe('')
    expect(valid.available).toBe(true)
    await expect(validateSkillPackage({ ...input, files: [{ ...input.files[0], content: 'tampered' }] })).rejects.toThrow('INVALID')
  })
  test('rejects traversal, missing SKILL.md, duplicate/case collisions, and wrong tree identity', async () => {
    const input = await exampleSkill()
    for (const path of ['../SKILL.md', '/SKILL.md', 'C:\\SKILL.md', 'folder/../SKILL.md', '.git/config']) await expect(validateSkillPackage({ ...input, files: [{ ...input.files[0], path }] })).rejects.toThrow('INVALID')
    const version = input.version as Board['skills'][number]
    await expect(validateSkillPackage({ ...input, version: { ...version, treeHash: '0'.repeat(64), id: `${version.skillId}@${'0'.repeat(64)}` } })).rejects.toThrow('INVALID')
  })
})
