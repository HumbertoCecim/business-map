import { describe, expect, test } from 'vitest'
import { env, runInDurableObject as runInActualObject } from 'cloudflare:test'
import type { BusinessObject } from '../object'
import type { Actor, ChangeCommand, SkillPackageInput } from '../model'
import { emptyBoard } from '../../../../shared/model'
import { canonicalJSON, createEventHeaders, MAX_BOARD_BYTES, sha256, signCapability } from '../domain'

const bindings = env as unknown as { BUSINESS_OBJECTS: DurableObjectNamespace<BusinessObject>; SKILL_PACKAGES: R2Bucket; APPROVAL_SECRET: string }
type TestStub = Pick<BusinessObject, 'initialize' | 'getSnapshot' | 'propose' | 'preview' | 'issueApproval' | 'apply' | 'reject' | 'manualCommand' | 'undo' | 'importBoard' | 'exportBoard' | 'importSkill' | 'readSkill'> & Pick<DurableObjectStub, 'fetch'>
// The transport is the original real stub. Project onto its explicit public methods
// so TS does not infinitely expand Cloudflare's recursive JSON preview serializer.
function runInDurableObject<T>(stub: TestStub, work: (instance: BusinessObject, state: DurableObjectState) => T | Promise<T>): Promise<T> {
  return runInActualObject(stub as unknown as DurableObjectStub<BusinessObject>, work)
}
// Cloudflare pool #14736 leaks handled stub RPC rejections. Exercise negative paths on the
// actual workerd instance, catching inside its event; positive paths still cross real RPC.
async function rejected(stub: TestStub, work: (instance: BusinessObject) => unknown, expected = '') {
  const message = await runInDurableObject(stub, async instance => {
    try { await work(instance); return null }
    catch (error) { return error instanceof Error ? error.message : String(error) }
  })
  expect(message).not.toBeNull()
  if (expected) expect(message).toContain(expected)
}
async function fresh() {
  const businessId = `business-${crypto.randomUUID()}`
  const actor: Actor = { userId: 'owner', businessId, channel: 'site' }
  const stub = bindings.BUSINESS_OBJECTS.get(bindings.BUSINESS_OBJECTS.idFromName(businessId)) as unknown as TestStub
  await stub.initialize(actor, { operationId: crypto.randomUUID(), title: 'Original' })
  const chatgpt: Actor = { ...actor, channel: 'chatgpt', clientId: 'approved-pilot', grantId: 'grant-a' }
  return { stub, actor, chatgpt }
}
const proposalInput = (baseRevision = 0, commands: ChangeCommand[] = [{ type: 'title', title: 'Proposed' }]) => ({ operationId: crypto.randomUUID(), baseRevision, title: 'Suggested change', rationale: 'Evidence', commands })

describe('actual SQLite Durable Object business writer', () => {
  test('hierarchy proposals require approval, reject invalid writes atomically, and restore cascade deletion through undo', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const root = { id: 'root-area', title: 'Custom area', questions: '', cards: [{ id: 'focus-card', title: 'Focus', text: '', firstStep: '', lane: 'later' as const, done: false, important: false, urgent: false }] }
    const child = { id: 'child-area', parentId: 'focus-card', title: 'Custom detail', questions: '', cards: [] }
    const proposal = await stub.propose(chatgpt, proposalInput(0, [{ type: 'section.save', section: root }, { type: 'section.save', section: child }]))
    expect((await stub.getSnapshot(actor)).board.sections).toEqual([])
    expect((await stub.preview(chatgpt, proposal.id)).after?.sections[1].parentId).toBe('focus-card')
    await rejected(stub, instance => instance.apply(chatgpt, { operationId: crypto.randomUUID(), proposalId: proposal.id }), 'FORBIDDEN')
    const approval = await stub.issueApproval(chatgpt, { action: 'apply', proposalId: proposal.id })
    await stub.apply(chatgpt, { operationId: crypto.randomUUID(), proposalId: proposal.id, capability: approval.capability })
    await rejected(stub, instance => instance.manualCommand(actor, {
      operationId: crypto.randomUUID(), baseRevision: 1,
      commands: [{ type: 'title', title: 'Must not persist' }, { type: 'section.save', section: { ...root, parentId: child.id } }],
    }), 'ciclo')
    expect((await stub.getSnapshot(actor)).board.title).toBe('Original')
    const deleted = await stub.manualCommand(actor, { operationId: crypto.randomUUID(), baseRevision: 1, commands: [{ type: 'card.delete', id: 'focus-card' }] })
    expect((await stub.getSnapshot(actor)).board.sections.map(section => section.id)).toEqual(['root-area'])
    await stub.undo(actor, { operationId: crypto.randomUUID(), transactionId: deleted.transactionId!, baseRevision: 2 })
    const restored = (await stub.getSnapshot(actor)).board
    expect(restored.revision).toBe(3)
    expect(restored.sections).toEqual([root, child])
    await rejected(stub, instance => instance.manualCommand(actor, { operationId: crypto.randomUUID(), baseRevision: 2, commands: [{ type: 'section.delete', id: root.id }] }), 'CONFLICT')
    const exported = await stub.exportBoard(actor, { format: 'json' })
    expect(JSON.parse(exported.content).sections[1].parentId).toBe('focus-card')
  })
  test('binds immutable owner and business at initialization and rejects confused-deputy access', async () => {
    const { stub, actor } = await fresh()
    await rejected(stub, instance => instance.getSnapshot({ ...actor, userId: 'intruder' }), 'FORBIDDEN')
    await rejected(stub, instance => instance.getSnapshot({ ...actor, businessId: 'another-business' }), 'FORBIDDEN')
    await rejected(stub, instance => instance.initialize({ ...actor, userId: 'intruder' }, { operationId: crypto.randomUUID() }), 'FORBIDDEN')
    await rejected(stub, instance => instance.initialize(actor, { operationId: crypto.randomUUID() }), 'CONFLICT')
    expect((await stub.getSnapshot(actor)).board.title).toBe('Original')
  })
  test('proposals are independent of confirmed revision/fingerprint and creation is idempotent', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const before = await stub.getSnapshot(actor), input = proposalInput()
    const proposed = await stub.propose(chatgpt, input)
    expect(await stub.propose(chatgpt, input)).toEqual(proposed)
    await rejected(stub, instance => instance.propose(chatgpt, { ...input, title: 'Different payload' }), 'CONFLICT')
    const after = await stub.getSnapshot(actor)
    expect(after.board).toEqual(before.board)
    expect(after.fingerprint).toBe(before.fingerprint)
    expect(after.proposals[0].status).toBe('pending')
    const preview = await stub.preview(chatgpt, proposed.id)
    expect(preview.before.title).toBe('Original')
    expect(preview.after?.title).toBe('Proposed')
    expect(preview.changes).toEqual([{ path: '/title', before: 'Original', after: 'Proposed' }])
  })
  test('OAuth identity alone cannot write; approved widget capability is action, client and grant bound', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const proposal = await stub.propose(chatgpt, proposalInput())
    await rejected(stub, instance => instance.apply(chatgpt, { operationId: crypto.randomUUID(), proposalId: proposal.id }), 'FORBIDDEN')
    await rejected(stub, instance => instance.manualCommand(chatgpt, { operationId: crypto.randomUUID(), baseRevision: 0, commands: [{ type: 'title', title: 'Bypass' }] }), 'FORBIDDEN')
    const approval = await stub.issueApproval(chatgpt, { action: 'apply', proposalId: proposal.id })
    const request = { operationId: crypto.randomUUID(), proposalId: proposal.id, capability: approval.capability }
    await rejected(stub, instance => instance.reject(chatgpt, request), 'FORBIDDEN')
    await rejected(stub, instance => instance.apply({ ...chatgpt, grantId: 'grant-b' }, request), 'FORBIDDEN')
    await rejected(stub, instance => instance.apply({ ...chatgpt, clientId: 'other-client' }, request), 'FORBIDDEN')
    expect((await stub.getSnapshot(actor)).board.revision).toBe(0)
    const applied = await stub.apply(chatgpt, request)
    expect(applied.revision).toBe(1)
    expect(await stub.apply(chatgpt, request)).toEqual(applied)
    await rejected(stub, instance => instance.apply(chatgpt, { ...request, operationId: crypto.randomUUID() }), 'CONFLICT')
    await rejected(stub, instance => instance.apply(chatgpt, { ...request, capability: 'different-payload' }), 'CONFLICT')
    const after = await stub.getSnapshot(actor)
    expect(after.board.title).toBe('Proposed')
    expect(after.board.revision).toBe(1)
    expect(after.proposals[0].status).toBe('applied')
    expect(after.audit).toHaveLength(1)
  })
  test('generic external clients may propose but cannot mint approvals or directly apply', async () => {
    const { stub, chatgpt } = await fresh()
    const external: Actor = { ...chatgpt, channel: 'external', clientId: 'third-party' }
    const proposal = await stub.propose(external, proposalInput())
    await rejected(stub, instance => instance.issueApproval(external, { action: 'apply', proposalId: proposal.id }), 'FORBIDDEN')
    await rejected(stub, instance => instance.apply(external, { operationId: crypto.randomUUID(), proposalId: proposal.id }), 'FORBIDDEN')
  })
  test('manual commands are CAS atomic under concurrent real RPC requests', async () => {
    const { stub, actor } = await fresh()
    const commands: ChangeCommand[] = [{ type: 'title', title: 'Invalid partial write' }, { type: 'card.delete', id: 'missing' }]
    await rejected(stub, instance => instance.manualCommand(actor, { operationId: crypto.randomUUID(), baseRevision: 0, commands }))
    expect((await stub.getSnapshot(actor)).board.title).toBe('Original')
    const results = await runInDurableObject(stub, async instance => Promise.allSettled(['A', 'B'].map(title => instance.manualCommand(actor, { operationId: crypto.randomUUID(), baseRevision: 0, commands: [{ type: 'title', title }] }))))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const after = await stub.getSnapshot(actor)
    expect(after.board.revision).toBe(1)
    expect(after.audit).toHaveLength(1)
  })
  test('stale approvals cannot overwrite a subsequent manual write and stale proposal can be rejected', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const proposal = await stub.propose(chatgpt, proposalInput())
    const approval = await stub.issueApproval(chatgpt, { action: 'apply', proposalId: proposal.id })
    await stub.manualCommand(actor, { operationId: crypto.randomUUID(), baseRevision: 0, commands: [{ type: 'title', title: 'Human changed it' }] })
    await rejected(stub, instance => instance.apply(chatgpt, { operationId: crypto.randomUUID(), proposalId: proposal.id, capability: approval.capability }), 'FORBIDDEN')
    const preview = await stub.preview(actor, proposal.id)
    expect(preview.stale).toBe(true)
    expect(preview.after).toBeNull()
    const rejection = await stub.issueApproval(chatgpt, { action: 'reject', proposalId: proposal.id })
    await stub.reject(chatgpt, { operationId: crypto.randomUUID(), proposalId: proposal.id, capability: rejection.capability })
    const after = await stub.getSnapshot(actor)
    expect(after.board.title).toBe('Human changed it')
    expect(after.board.revision).toBe(1)
    expect(after.proposals[0].status).toBe('rejected')
  })
  test('racing confirmations use one capability once and persist a single receipt/transaction', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const proposal = await stub.propose(chatgpt, proposalInput())
    const approval = await stub.issueApproval(chatgpt, { action: 'apply', proposalId: proposal.id })
    const request = { operationId: crypto.randomUUID(), proposalId: proposal.id, capability: approval.capability }
    const sameOperation = await Promise.all([stub.apply(chatgpt, request), stub.apply(chatgpt, request)])
    expect(sameOperation[0]).toEqual(sameOperation[1])
    expect((await stub.getSnapshot(actor)).board.revision).toBe(1)
  })
  test('undo is a new revision with audit, requires widget capability and cannot undo after a subsequent write', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const proposal = await stub.propose(chatgpt, proposalInput())
    const applyApproval = await stub.issueApproval(chatgpt, { action: 'apply', proposalId: proposal.id })
    const result = await stub.apply(chatgpt, { operationId: crypto.randomUUID(), proposalId: proposal.id, capability: applyApproval.capability })
    const undoInput = { operationId: crypto.randomUUID(), transactionId: result.transactionId!, baseRevision: 1 }
    await rejected(stub, instance => instance.undo(chatgpt, undoInput), 'FORBIDDEN')
    const approval = await stub.issueApproval(chatgpt, { action: 'undo', transactionId: result.transactionId!, baseRevision: 1 })
    const request = { ...undoInput, capability: approval.capability }
    const undone = await stub.undo(chatgpt, request)
    expect(undone.revision).toBe(2)
    expect(await stub.undo(chatgpt, request)).toEqual(undone)
    const after = await stub.getSnapshot(actor)
    expect(after.board.title).toBe('Original')
    expect(after.audit.map(entry => entry.action)).toEqual(['undo', 'apply'])
    expect(after.audit.every(entry => !('before' in entry))).toBe(true)
    await rejected(stub, instance => instance.undo(actor, { operationId: crypto.randomUUID(), transactionId: undone.transactionId!, baseRevision: 2 }), 'CONFLICT')
    await stub.manualCommand(actor, { operationId: crypto.randomUUID(), baseRevision: 2, commands: [{ type: 'title', title: 'Later' }] })
    await rejected(stub, instance => instance.undo(actor, { operationId: crypto.randomUUID(), transactionId: result.transactionId!, baseRevision: 3 }), 'CONFLICT')
  })
  test('ChatGPT cannot mint or execute undo of a site write, while the site retains undo', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const result = await stub.manualCommand(actor, { operationId: crypto.randomUUID(), baseRevision: 0, commands: [{ type: 'title', title: 'Site change' }] })
    await rejected(stub, instance => instance.issueApproval(chatgpt, { action: 'undo', transactionId: result.transactionId!, baseRevision: 1 }), 'ChatGPT can undo only')
    const snapshot = await stub.getSnapshot(actor)
    // Even a correctly signed token cannot override the DO's channel restriction.
    const capability = await signCapability({ version: 1, actor: chatgpt, action: 'undo', targetId: result.transactionId!, baseRevision: 1, hash: await sha256(canonicalJSON(snapshot.audit[0])), expiresAt: Date.now() + 60_000, nonce: crypto.randomUUID() }, bindings.APPROVAL_SECRET)
    await rejected(stub, instance => instance.undo(chatgpt, { operationId: crypto.randomUUID(), transactionId: result.transactionId!, baseRevision: 1, capability }), 'ChatGPT can undo only')
    expect((await stub.getSnapshot(actor)).board.title).toBe('Site change')
    await stub.undo(actor, { operationId: crypto.randomUUID(), transactionId: result.transactionId!, baseRevision: 1 })
    expect((await stub.getSnapshot(actor)).board.title).toBe('Original')
  })
  test('approval issuance deletes expired and consumed expired nonces atomically', async () => {
    const { stub, chatgpt } = await fresh()
    const proposal = await stub.propose(chatgpt, proposalInput())
    await stub.issueApproval(chatgpt, { action: 'apply', proposalId: proposal.id })
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < 20; i++) state.storage.sql.exec('INSERT INTO business_approvals(nonce,expires_at,payload,consumed) VALUES (?,?,?,?)', `old-${i}`, Date.now() - 1, '{}', i % 2)
    })
    await stub.issueApproval(chatgpt, { action: 'reject', proposalId: proposal.id })
    const count = await runInDurableObject(stub, (_instance, state) => state.storage.sql.exec<{ count: number }>('SELECT count(*) as count FROM business_approvals').one().count)
    expect(count).toBe(2)
  })
  test('audit summaries describe executed command counts instead of model-provided titles', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const proposal = await stub.propose(chatgpt, { ...proposalInput(0, [{ type: 'title', title: 'Different' }, { type: 'whereStopped', text: 'Continue' }]), title: 'Only harmless grammar, nothing important!' })
    await stub.apply(actor, { operationId: crypto.randomUUID(), proposalId: proposal.id })
    expect((await stub.getSnapshot(actor)).audit[0].summary).toBe('title: 1, whereStopped: 1')
  })
  test('commit bounds the full SQLite state wrapper and rolls oversized import back', async () => {
    const { stub, actor } = await fresh()
    const board = emptyBoard('copied-board'), treeHash = 'a'.repeat(64), skillId = 'skill-0123456789abcdef0123'
    board.skills = [{ id: `${skillId}@${treeHash}`, skillId, treeHash, name: 'Large reference', description: '', files: [{ path: 'SKILL.md', size: 0, sha256: 'b'.repeat(64), encoding: 'utf8' }], sourcePath: '', sourceUrl: '', createdAt: '2026-01-01', parentVersionId: null, originalVersionId: null, rationale: '', diff: '' }]
    const size = new TextEncoder().encode(JSON.stringify(board)).length
    board.skills[0].diff = 'x'.repeat(MAX_BOARD_BYTES - size - 100)
    expect(new TextEncoder().encode(JSON.stringify(board)).length).toBeLessThan(MAX_BOARD_BYTES)
    await rejected(stub, instance => instance.importBoard(actor, { operationId: crypto.randomUUID(), board }), 'LIMIT')
    const snapshot = await stub.getSnapshot(actor)
    expect(snapshot.board.revision).toBe(0)
    expect(snapshot.board.skills).toEqual([])
    expect(snapshot.audit).toEqual([])
  })
  test('import creates an independent copy only in an empty business, and JSON/Markdown export round-trip content', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const local = emptyBoard('local-business-id')
    local.title = 'Local business'
    local.agent.id = 'local-daemon'
    const input = { operationId: crypto.randomUUID(), board: local }
    await rejected(stub, instance => instance.importBoard(chatgpt, input), 'FORBIDDEN')
    const result = await stub.importBoard(actor, input)
    expect(await stub.importBoard(actor, input)).toEqual(result)
    const snapshot = await stub.getSnapshot(actor)
    expect(snapshot.businessId).toBe(actor.businessId)
    expect(snapshot.board.boardId).toBe('local-business-id')
    expect(snapshot.board.agent.id).toBeNull()
    expect(local.agent.id).toBe('local-daemon')
    const json = await stub.exportBoard(actor, { format: 'json' })
    expect(JSON.parse(json.content)).toEqual(snapshot.board)
    const markdown = await stub.exportBoard(actor, { format: 'markdown' })
    expect(markdown.content).toContain('# Local business')
    await rejected(stub, instance => instance.importBoard(actor, { ...input, operationId: crypto.randomUUID() }), 'CONFLICT')
  })
  test('exports persist immutable content-addressed private R2 artifacts isolated by business', async () => {
    const first = await fresh(), second = await fresh()
    const sameSource = emptyBoard('identical-portable-source')
    await first.stub.importBoard(first.actor, { operationId: crypto.randomUUID(), board: sameSource })
    await second.stub.importBoard(second.actor, { operationId: crypto.randomUUID(), board: sameSource })
    const file = await first.stub.exportBoard(first.actor, { format: 'json' })
    expect(await first.stub.exportBoard(first.actor, { format: 'json' })).toEqual(file)
    const businessHash = await sha256(first.actor.businessId), contentHash = await sha256(file.content)
    const prefix = `business/${businessHash}/exports/`
    const listed = await bindings.SKILL_PACKAGES.list({ prefix })
    expect(listed.objects).toHaveLength(1)
    expect(listed.objects[0].key).toBe(`${prefix}${contentHash}.json`)
    const artifact = await bindings.SKILL_PACKAGES.get(listed.objects[0].key)
    expect(artifact).not.toBeNull()
    expect(await artifact!.text()).toBe(file.content)
    expect(artifact!.httpMetadata?.contentType).toBe(file.contentType)
    expect(artifact!.httpMetadata?.cacheControl).toBe('private, no-store')
    expect(artifact!.customMetadata).toMatchObject({ contentHash, businessHash, format: 'json', schemaVersion: '3', immutable: 'true' })
    const otherPrefix = `business/${await sha256(second.actor.businessId)}/exports/`
    expect((await bindings.SKILL_PACKAGES.list({ prefix: otherPrefix })).objects).toHaveLength(0)
    const otherFile = await second.stub.exportBoard(second.actor, { format: 'json' })
    expect((await bindings.SKILL_PACKAGES.list({ prefix: otherPrefix })).objects).toHaveLength(1)
    // Identical portable copies must still produce two account-private artifact keys.
    expect(otherFile.content).toBe(file.content)
    await rejected(first.stub, instance => instance.exportBoard(second.actor, { format: 'json' }), 'FORBIDDEN')
    const markdown = await first.stub.exportBoard(first.actor, { format: 'markdown' })
    expect((await bindings.SKILL_PACKAGES.get(`${prefix}${await sha256(markdown.content)}.md`))?.customMetadata?.format).toBe('markdown')
    expect((await bindings.SKILL_PACKAGES.list({ prefix })).objects).toHaveLength(2)
  })
  test('private R2 skill packages preserve immutable content, account isolation, and never execute', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const content = '# SKILL\nReference only.\n'
    const manifest = [{ path: 'SKILL.md', size: new TextEncoder().encode(content).length, sha256: await sha256(content), encoding: 'utf8' as const }]
    const treeHash = await sha256(JSON.stringify(manifest)), skillId = 'skill-0123456789abcdef0123'
    const skillPackage: SkillPackageInput = { version: { id: `${skillId}@${treeHash}`, skillId, treeHash, name: 'Private skill', description: '', files: manifest, sourcePath: 'C:\\private', sourceUrl: '', createdAt: '2026-01-01', parentVersionId: null, originalVersionId: null, rationale: '', diff: '' }, files: [{ path: 'SKILL.md', encoding: 'utf8', content }] }
    const input = { operationId: crypto.randomUUID(), baseRevision: 0, package: skillPackage }
    const result = await stub.importSkill(actor, input)
    expect(await stub.importSkill(actor, input)).toEqual(result)
    const stored = await stub.readSkill(chatgpt, `${skillId}@${treeHash}`)
    expect(stored.available).toBe(true)
    if (stored.available) expect(stored.files[0].content).toBe(content)
    expect(stored.version.sourcePath).toBe('')
    const other = await fresh()
    await rejected(other.stub, instance => instance.readSkill(other.actor, `${skillId}@${treeHash}`), 'NOT_FOUND')
    await rejected(stub, instance => instance.readSkill({ ...actor, businessId: other.actor.businessId }, `${skillId}@${treeHash}`), 'FORBIDDEN')
    const objects = await bindings.SKILL_PACKAGES.list({ prefix: `business/${await sha256(actor.businessId)}/` })
    expect(objects.objects).toHaveLength(1)
    const metadataOnly = emptyBoard('copied-local-board')
    metadataOnly.skills = [stored.version]
    await other.stub.importBoard(other.actor, { operationId: crypto.randomUUID(), board: metadataOnly })
    expect((await other.stub.readSkill(other.actor, stored.version.id)).available).toBe(false)
    const attached = await other.stub.importSkill(other.actor, { operationId: crypto.randomUUID(), baseRevision: 1, package: skillPackage })
    expect((await other.stub.readSkill(other.actor, stored.version.id)).available).toBe(true)
    await other.stub.undo(other.actor, { operationId: crypto.randomUUID(), baseRevision: 2, transactionId: attached.transactionId! })
    expect((await other.stub.readSkill(other.actor, stored.version.id)).available).toBe(false)
  })
  test('authenticated hibernating events broadcast revision-only proposal/mutation invalidations', async () => {
    const { stub, actor, chatgpt } = await fresh()
    const unsigned = await stub.fetch(new Request('https://business.internal/events', { headers: { Upgrade: 'websocket' } }))
    expect(unsigned.status).toBe(403)
    const wrongOwner = await stub.fetch(new Request('https://business.internal/events', { headers: { Upgrade: 'websocket', ...await createEventHeaders({ ...actor, userId: 'intruder' }, bindings.APPROVAL_SECRET) } }))
    expect(wrongOwner.status).toBe(403)
    const oauth = await stub.fetch(new Request('https://business.internal/events', { headers: { Upgrade: 'websocket', ...await createEventHeaders(chatgpt, bindings.APPROVAL_SECRET) } }))
    expect(oauth.status).toBe(403)
    const response = await stub.fetch(new Request('https://business.internal/events', { headers: { Upgrade: 'websocket', ...await createEventHeaders(actor, bindings.APPROVAL_SECRET) } }))
    expect(response.status).toBe(101)
    const socket = response.webSocket!
    const next = () => new Promise<string>(resolve => socket.addEventListener('message', event => resolve(String(event.data)), { once: true }))
    const initial = next(); socket.accept()
    expect(JSON.parse(await initial)).toEqual({ type: 'invalidate', revision: 0 })
    try {
      const proposedEvent = next()
      await stub.propose(chatgpt, proposalInput())
      expect(JSON.parse(await proposedEvent)).toEqual({ type: 'invalidate', revision: 0 })
      const changedEvent = next()
      await stub.manualCommand(actor, { operationId: crypto.randomUUID(), baseRevision: 0, commands: [{ type: 'title', title: 'Secret business content' }] })
      const message = await changedEvent
      expect(JSON.parse(message)).toEqual({ type: 'invalidate', revision: 1 })
      expect(message).not.toContain('Secret')
    } finally {
      const closed = new Promise<void>(resolve => socket.addEventListener('close', () => resolve(), { once: true }))
      socket.close(1000)
      await closed
    }
  })
})
