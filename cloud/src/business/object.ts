import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'
import { parseBoard, type Board } from '../../../shared/model'
import { skillVersionSchema } from '../../../shared/evolution'
import {
  actorSchema, approvalRequestSchema, DomainError, manualCommandSchema, operationIdSchema,
  proposeSchema, proposalMutationSchema, undoSchema,
  type Actor, type ApprovalCapability, type ApprovalRequest, type ApprovalResult, type AuditEntry,
  type ManualCommandInput, type MutationReceipt, type Proposal, type ProposalMutationInput,
  type ProposalPreview, type ProposeInput, type SkillPackageInput, type Snapshot, type UndoInput,
} from './model'
import {
  applyBatch, assertActor, assertBounded, assertRevision, assertSite, boardChanges, canonicalJSON,
  commandSummary, exportPortable, importPortableBoard, isEmptyBoard, newBoard, sha256, signCapability, verifyCapability, verifyEventHeaders,
} from './domain'
import { storeSkillPackage, readSkillPackage, type StoredSkillPackage } from './skills'

export type BusinessEnv = { APPROVAL_SECRET: string; SKILL_PACKAGES: R2Bucket }
type State = { owner: { userId: string; businessId: string }; board: Board; lastTransactionId: string | null; skillPackages?: Record<string, string> }
type StoredReceipt = { actor: Actor; requestHash: string; result: MutationReceipt | Proposal }
type Transaction = { audit: AuditEntry; before: Board; beforeSkillPackages?: Record<string, string>; afterRevision: number; undone: boolean }
const initializeSchema = z.object({ operationId: operationIdSchema, title: z.string().max(500).optional() }).strict()
const importSchema = z.object({ operationId: operationIdSchema, board: z.unknown() }).strict()

/** The only writer of confirmed business state. Call only through an authenticated Worker. */
export class BusinessObject extends DurableObject<BusinessEnv> {
  constructor(ctx: DurableObjectState, env: BusinessEnv) {
    super(ctx, env)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS business_documents (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS business_proposals (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, value TEXT NOT NULL)')
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS business_proposals_status ON business_proposals(status, created_at)')
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS business_transactions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL UNIQUE, value TEXT NOT NULL)')
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS business_approvals (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, payload TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0)')
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS business_approvals_expiry ON business_approvals(expires_at)')
  }
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== '/events' || request.method !== 'GET') return new Response('Not found', { status: 404 })
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required', { status: 426 })
    try {
      const actor = await verifyEventHeaders(request.headers, this.env.APPROVAL_SECRET)
      const { state } = this.state(actor)
      assertSite(actor)
      const active = this.ctx.getWebSockets().filter(socket => {
        const attachment = socket.deserializeAttachment() as { expiresAt?: number } | null
        if (!attachment?.expiresAt || attachment.expiresAt <= Date.now()) { socket.close(4401, 'Session renewal required'); return false }
        return true
      })
      if (active.length >= 20) return new Response('Too many event subscriptions', { status: 429 })
      const pair = new WebSocketPair(), client = pair[0], server = pair[1]
      this.ctx.acceptWebSocket(server)
      server.serializeAttachment({ actor, expiresAt: Date.now() + 60_000 })
      server.send(JSON.stringify({ type: 'invalidate', revision: state.board.revision }))
      return new Response(null, { status: 101, webSocket: client })
    } catch (error) {
      return new Response(error instanceof Error ? error.message : 'Forbidden', { status: 403 })
    }
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const attachment = socket.deserializeAttachment() as { expiresAt?: number } | null
    if (!attachment?.expiresAt || attachment.expiresAt <= Date.now()) { socket.close(4401, 'Reconnect to renew the site session'); return }
    if (message === 'ping') socket.send('pong')
    else socket.close(1008, 'Events are read only')
  }
  webSocketClose(socket: WebSocket): void { socket.close(1000, 'Event subscription closed') }
  webSocketError(socket: WebSocket): void { socket.close(1011, 'Event subscription error') }
  private invalidate(): void {
    const state = this.get<State>('state')
    if (!state) return
    const message = JSON.stringify({ type: 'invalidate', revision: state.board.revision })
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const attachment = socket.deserializeAttachment() as { actor?: Actor; expiresAt?: number } | null
        if (!attachment?.actor || !attachment.expiresAt || attachment.expiresAt <= Date.now()) { socket.close(4401, 'Reconnect to renew the site session'); continue }
        assertActor(attachment.actor, state.owner)
        socket.send(message)
      } catch { socket.close(1011, 'Event subscription closed') }
    }
  }
  private write<T>(work: () => T): T {
    const result = this.ctx.storage.transactionSync(work)
    this.invalidate()
    return result
  }
  private get<T>(key: string): T | undefined {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM business_documents WHERE key = ?', key).toArray()[0]
    return row ? JSON.parse(row.value) as T : undefined
  }
  private put(key: string, value: unknown): void {
    this.ctx.storage.sql.exec('INSERT INTO business_documents(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value))
  }
  private state(raw: Actor): { state: State; actor: Actor } {
    const state = this.get<State>('state')
    if (!state) throw new DomainError('UNINITIALIZED', 'Business has not been initialized.')
    const actor = assertActor(raw, state.owner)
    return { state, actor }
  }
  private receipt<T extends MutationReceipt | Proposal>(operationId: string, actor: Actor, requestHash: string): T | undefined {
    const saved = this.get<StoredReceipt>(`receipt:${operationId}`)
    if (!saved) return undefined
    if (canonicalJSON(saved.actor) !== canonicalJSON(actor) || saved.requestHash !== requestHash) throw new DomainError('CONFLICT', 'Operation ID was already used with another payload or actor.')
    return saved.result as T
  }
  private saveReceipt(operationId: string, actor: Actor, requestHash: string, result: MutationReceipt | Proposal): void {
    this.put(`receipt:${operationId}`, { actor, requestHash, result } satisfies StoredReceipt)
  }
  private proposal(id: string): Proposal {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM business_proposals WHERE id = ?', id).toArray()[0]
    if (!row) throw new DomainError('NOT_FOUND', 'Proposal was not found.')
    return JSON.parse(row.value) as Proposal
  }
  private putProposal(proposal: Proposal): void {
    this.ctx.storage.sql.exec('INSERT INTO business_proposals(id,status,created_at,value) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,value=excluded.value', proposal.id, proposal.status, proposal.createdAt, JSON.stringify(proposal))
  }
  private transaction(id: string): Transaction {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM business_transactions WHERE id = ?', id).toArray()[0]
    if (!row) throw new DomainError('NOT_FOUND', 'Transaction was not found.')
    return JSON.parse(row.value) as Transaction
  }
  private commit(state: State, actor: Actor, after: Board, input: { operationId: string; action: MutationReceipt['action']; summary: string; proposalId?: string; skillPackages?: Record<string, string> }): MutationReceipt {
    const at = new Date().toISOString(), transactionId = `tx-${crypto.randomUUID()}`
    const audit: AuditEntry = { transactionId, action: input.action, revision: after.revision, at, summary: input.summary, actor, ...(input.proposalId ? { proposalId: input.proposalId } : {}) }
    const transaction: Transaction = { audit, before: state.board, beforeSkillPackages: state.skillPackages ?? {}, afterRevision: after.revision, undone: false }
    const nextState: State = { ...state, board: after, lastTransactionId: transactionId, skillPackages: input.skillPackages ?? state.skillPackages ?? {} }
    // Guard every confirmed path, including undo/import/skill metadata and their storage wrappers.
    assertBounded(after)
    assertBounded(transaction)
    assertBounded(nextState)
    this.ctx.storage.sql.exec('INSERT INTO business_transactions(id,revision,value) VALUES (?,?,?)', transactionId, after.revision, JSON.stringify(transaction))
    // Only the most recent snapshot is needed to undo. Earlier audit summaries survive without full board history.
    this.ctx.storage.sql.exec('UPDATE business_transactions SET value=json_remove(value,\'$.before\',\'$.beforeSkillPackages\') WHERE id <> ?', transactionId)
    this.put('state', nextState)
    return { operationId: input.operationId, businessId: state.owner.businessId, action: input.action, revision: after.revision, at, transactionId, ...(input.proposalId ? { proposalId: input.proposalId } : {}) }
  }
  async initialize(rawActor: Actor, raw: { operationId: string; title?: string }): Promise<MutationReceipt> {
    const actor = actorSchema.parse(rawActor), input = initializeSchema.parse(raw)
    assertSite(actor)
    const requestHash = await sha256(canonicalJSON({ action: 'initialize', input }))
    return this.write(() => {
      const existing = this.get<State>('state')
      if (existing) assertActor(actor, existing.owner)
      const replay = this.receipt<MutationReceipt>(input.operationId, actor, requestHash)
      if (replay) return replay
      if (existing) throw new DomainError('CONFLICT', 'Business is already initialized.')
      const state: State = { owner: { userId: actor.userId, businessId: actor.businessId }, board: newBoard(actor.businessId, input.title), lastTransactionId: null }
      this.put('state', state)
      const result: MutationReceipt = { operationId: input.operationId, businessId: actor.businessId, action: 'initialize', revision: 0, at: new Date().toISOString() }
      this.saveReceipt(input.operationId, actor, requestHash, result)
      return result
    })
  }
  async getSnapshot(rawActor: Actor): Promise<Snapshot> {
    const { state } = this.state(rawActor)
    const proposals = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM business_proposals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100").toArray().map(row => JSON.parse(row.value) as Proposal)
    const recent = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM business_proposals WHERE status <> 'pending' ORDER BY created_at DESC LIMIT 20").toArray().map(row => JSON.parse(row.value) as Proposal)
    const audit = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM business_transactions ORDER BY revision DESC LIMIT 20').toArray().map(row => (JSON.parse(row.value) as Transaction).audit)
    return { businessId: state.owner.businessId, fingerprint: await sha256(canonicalJSON(state.board)), board: state.board, proposals: [...proposals, ...recent], audit, lastTransactionId: state.lastTransactionId }
  }
  async propose(rawActor: Actor, raw: ProposeInput): Promise<Proposal> {
    const { actor } = this.state(rawActor)
    assertBounded(raw, 2_000_000)
    const input = proposeSchema.parse(raw), requestHash = await sha256(canonicalJSON({ action: 'propose', input }))
    // Hash covers the complete, typed batch and revision; the title/rationale cannot authorize extra writes.
    const hash = await sha256(canonicalJSON({ baseRevision: input.baseRevision, commands: input.commands }))
    return this.write(() => {
      const { state } = this.state(actor)
      const replay = this.receipt<Proposal>(input.operationId, actor, requestHash)
      if (replay) return replay
      applyBatch(state.board, input.commands, input.baseRevision)
      const count = this.ctx.storage.sql.exec<{ count: number }>("SELECT count(*) AS count FROM business_proposals WHERE status = 'pending'").one().count
      if (count >= 100) throw new DomainError('LIMIT', 'Resolve pending proposals before creating more.')
      const proposal: Proposal = { id: `proposal-${crypto.randomUUID()}`, title: input.title, rationale: input.rationale, baseRevision: input.baseRevision, commands: input.commands, hash, status: 'pending', createdAt: new Date().toISOString(), createdBy: actor }
      this.putProposal(proposal)
      this.saveReceipt(input.operationId, actor, requestHash, proposal)
      return proposal
    })
  }
  async preview(rawActor: Actor, proposalId: string): Promise<ProposalPreview> {
    const { state } = this.state(rawActor), proposal = this.proposal(proposalId)
    const stale = proposal.baseRevision !== state.board.revision
    const after = stale ? null : applyBatch(state.board, proposal.commands, proposal.baseRevision)
    return { proposal, before: state.board, after, stale, changes: after ? boardChanges(state.board, after) : [] }
  }
  async issueApproval(rawActor: Actor, raw: ApprovalRequest): Promise<ApprovalResult> {
    const { state, actor } = this.state(rawActor), input = approvalRequestSchema.parse(raw)
    if (actor.channel === 'external') throw new DomainError('FORBIDDEN', 'Approval is available only through the site or approved ChatGPT App presentation.')
    let targetId: string, hash: string, baseRevision: number
    if (input.action === 'undo') {
      assertRevision(state.board, input.baseRevision)
      const transaction = this.transaction(input.transactionId)
      this.assertUndo(state, transaction, input.transactionId, actor)
      targetId = input.transactionId; baseRevision = input.baseRevision
      hash = await sha256(canonicalJSON(transaction.audit))
    } else {
      const proposal = this.proposal(input.proposalId)
      if (proposal.status !== 'pending') throw new DomainError('CONFLICT', 'Proposal is already resolved.')
      if (input.action === 'apply') applyBatch(state.board, proposal.commands, proposal.baseRevision)
      targetId = proposal.id; hash = proposal.hash; baseRevision = state.board.revision
    }
    const payload: ApprovalCapability = { version: 1, actor, action: input.action, targetId, hash, baseRevision, expiresAt: Date.now() + (input.ttlSeconds ?? 300) * 1000, nonce: crypto.randomUUID() }
    const capability = await signCapability(payload, this.env.APPROVAL_SECRET)
    this.ctx.storage.transactionSync(() => {
      const { state: current } = this.state(actor)
      assertRevision(current.board, baseRevision)
      if (input.action === 'undo') this.assertUndo(current, this.transaction(targetId), targetId, actor)
      else if (this.proposal(targetId).status !== 'pending') throw new DomainError('CONFLICT', 'Proposal is already resolved.')
      this.ctx.storage.sql.exec('DELETE FROM business_approvals WHERE expires_at <= ?', Date.now())
      this.ctx.storage.sql.exec('INSERT INTO business_approvals(nonce,expires_at,payload,consumed) VALUES (?,?,?,0)', payload.nonce, payload.expiresAt, canonicalJSON(payload))
    })
    return { capability, expiresAt: new Date(payload.expiresAt).toISOString() }
  }
  private async approval(actor: Actor, token: string | undefined, expected: Pick<ApprovalCapability, 'action' | 'targetId' | 'hash' | 'baseRevision'>): Promise<ApprovalCapability | null> {
    if (actor.channel === 'site' && !token) return null
    if (!token || actor.channel === 'external') throw new DomainError('FORBIDDEN', 'Human approval capability is required.')
    return verifyCapability(token, this.env.APPROVAL_SECRET, actor, expected)
  }
  private consume(payload: ApprovalCapability | null): void {
    if (!payload) return
    const nonce = this.ctx.storage.sql.exec<{ payload: string; consumed: number }>('SELECT payload,consumed FROM business_approvals WHERE nonce = ?', payload.nonce).toArray()[0]
    if (!nonce || nonce.consumed || nonce.payload !== canonicalJSON(payload)) throw new DomainError('CONFLICT', 'Approval capability was already consumed or revoked.')
    if (payload.expiresAt <= Date.now()) throw new DomainError('EXPIRED', 'Approval expired. Open a new preview.')
    this.ctx.storage.sql.exec('UPDATE business_approvals SET consumed=1 WHERE nonce = ?', payload.nonce)
  }
  async apply(actor: Actor, raw: ProposalMutationInput): Promise<MutationReceipt> { return this.resolve(actor, raw, 'apply') }
  async reject(actor: Actor, raw: ProposalMutationInput): Promise<MutationReceipt> { return this.resolve(actor, raw, 'reject') }
  private async resolve(rawActor: Actor, raw: ProposalMutationInput, action: 'apply' | 'reject'): Promise<MutationReceipt> {
    const { state, actor } = this.state(rawActor), input = proposalMutationSchema.parse(raw)
    const requestHash = await sha256(canonicalJSON({ action, input }))
    const replay = this.receipt<MutationReceipt>(input.operationId, actor, requestHash)
    if (replay) return replay
    const proposal = this.proposal(input.proposalId)
    if (proposal.status !== 'pending') throw new DomainError('CONFLICT', 'Proposal is already resolved.')
    const approval = await this.approval(actor, input.capability, { action, targetId: proposal.id, hash: proposal.hash, baseRevision: state.board.revision })
    return this.write(() => {
      const { state: current } = this.state(actor)
      const replay = this.receipt<MutationReceipt>(input.operationId, actor, requestHash)
      if (replay) return replay
      const proposal = this.proposal(input.proposalId)
      if (proposal.status !== 'pending') throw new DomainError('CONFLICT', 'Proposal is already resolved.')
      if (approval) assertRevision(current.board, approval.baseRevision)
      let result: MutationReceipt
      if (action === 'apply') {
        const after = applyBatch(current.board, proposal.commands, proposal.baseRevision)
        this.consume(approval)
        result = this.commit(current, actor, after, { operationId: input.operationId, action, summary: commandSummary(proposal.commands), proposalId: proposal.id })
        proposal.transactionId = result.transactionId
      } else {
        this.consume(approval)
        result = { operationId: input.operationId, businessId: actor.businessId, action, revision: current.board.revision, at: new Date().toISOString(), proposalId: proposal.id }
      }
      proposal.status = action === 'apply' ? 'applied' : 'rejected'
      proposal.resolvedAt = result.at
      this.putProposal(proposal)
      this.saveReceipt(input.operationId, actor, requestHash, result)
      return result
    })
  }
  async manualCommand(rawActor: Actor, raw: ManualCommandInput): Promise<MutationReceipt> {
    const { actor } = this.state(rawActor)
    assertSite(actor); assertBounded(raw, 2_000_000)
    const input = manualCommandSchema.parse(raw), requestHash = await sha256(canonicalJSON({ action: 'manual', input }))
    return this.write(() => {
      const { state } = this.state(actor)
      const replay = this.receipt<MutationReceipt>(input.operationId, actor, requestHash)
      if (replay) return replay
      const after = applyBatch(state.board, input.commands, input.baseRevision)
      const result = this.commit(state, actor, after, { operationId: input.operationId, action: 'manual', summary: commandSummary(input.commands) })
      this.saveReceipt(input.operationId, actor, requestHash, result)
      return result
    })
  }
  private assertUndo(state: State, transaction: Transaction, transactionId: string, actor: Actor): void {
    if (actor.channel === 'chatgpt' && transaction.audit.actor.channel !== 'chatgpt') throw new DomainError('FORBIDDEN', 'ChatGPT can undo only a change confirmed through ChatGPT. Use the site for other changes.')
    if (state.lastTransactionId !== transactionId || transaction.afterRevision !== state.board.revision || transaction.undone || !transaction.before || transaction.audit.action === 'undo') throw new DomainError('CONFLICT', 'Only the latest confirmed change can be undone, once, before any subsequent write.')
  }
  async undo(rawActor: Actor, raw: UndoInput): Promise<MutationReceipt> {
    const { actor } = this.state(rawActor), input = undoSchema.parse(raw)
    const requestHash = await sha256(canonicalJSON({ action: 'undo', input }))
    const replay = this.receipt<MutationReceipt>(input.operationId, actor, requestHash)
    if (replay) return replay
    const transaction = this.transaction(input.transactionId)
    const hash = await sha256(canonicalJSON(transaction.audit))
    const approval = await this.approval(actor, input.capability, { action: 'undo', targetId: input.transactionId, hash, baseRevision: input.baseRevision })
    return this.write(() => {
      const { state } = this.state(actor)
      const replay = this.receipt<MutationReceipt>(input.operationId, actor, requestHash)
      if (replay) return replay
      assertRevision(state.board, input.baseRevision)
      const transaction = this.transaction(input.transactionId)
      this.assertUndo(state, transaction, input.transactionId, actor)
      const after = parseBoard({ ...transaction.before, revision: state.board.revision + 1 })
      this.consume(approval)
      transaction.undone = true
      this.ctx.storage.sql.exec('UPDATE business_transactions SET value = ? WHERE id = ?', JSON.stringify(transaction), input.transactionId)
      const result = this.commit(state, actor, after, { operationId: input.operationId, action: 'undo', summary: `Desfeito: ${transaction.audit.summary}`, skillPackages: transaction.beforeSkillPackages ?? {} })
      this.saveReceipt(input.operationId, actor, requestHash, result)
      return result
    })
  }
  async importBoard(rawActor: Actor, raw: { operationId: string; board: unknown }): Promise<MutationReceipt> {
    const { actor } = this.state(rawActor)
    assertSite(actor); assertBounded(raw)
    const input = importSchema.parse(raw), requestHash = await sha256(canonicalJSON({ action: 'import', input }))
    const imported = importPortableBoard(input.board)
    return this.write(() => {
      const { state } = this.state(actor)
      const replay = this.receipt<MutationReceipt>(input.operationId, actor, requestHash)
      if (replay) return replay
      if (!isEmptyBoard(state.board)) throw new DomainError('CONFLICT', 'Import requires an empty business; existing content will not be overwritten.')
      const result = this.commit(state, actor, imported, { operationId: input.operationId, action: 'import', summary: 'Cópia independente importada' })
      this.saveReceipt(input.operationId, actor, requestHash, result)
      return result
    })
  }
  async exportBoard(rawActor: Actor, raw: { format: 'json' | 'markdown' }): Promise<ReturnType<typeof exportPortable>> {
    const { state, actor } = this.state(rawActor)
    const { format } = z.object({ format: z.enum(['json', 'markdown']) }).strict().parse(raw)
    const file = exportPortable(state.board, format)
    const [businessHash, contentHash] = await Promise.all([sha256(actor.businessId), sha256(file.content)])
    const key = `business/${businessHash}/exports/${contentHash}.${format === 'json' ? 'json' : 'md'}`
    const stored = await this.env.SKILL_PACKAGES.put(key, file.content, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: file.contentType, cacheControl: 'private, no-store' },
      customMetadata: { contentHash, businessHash, format, schemaVersion: '3', revision: String(state.board.revision), immutable: 'true' },
    })
    if (!stored) {
      const existing = await this.env.SKILL_PACKAGES.get(key)
      if (!existing || existing.customMetadata?.contentHash !== contentHash || existing.customMetadata?.businessHash !== businessHash || existing.httpMetadata?.contentType !== file.contentType || await existing.text() !== file.content) throw new DomainError('INVALID', 'Private export artifact failed its integrity check.')
    }
    return file
  }
  async importSkill(rawActor: Actor, raw: { operationId: string; baseRevision: number; package: SkillPackageInput }): Promise<MutationReceipt> {
    const { state: initial, actor } = this.state(rawActor)
    assertSite(actor)
    assertBounded(raw, 32_000_000)
    const operationId = operationIdSchema.parse(raw.operationId)
    const baseRevision = z.number().int().nonnegative().parse(raw.baseRevision)
    const requestHash = await sha256(canonicalJSON({ action: 'skill.import', input: raw }))
    const replay = this.receipt<MutationReceipt>(operationId, actor, requestHash)
    if (replay) return replay
    assertRevision(initial.board, baseRevision)
    const requestedVersion = skillVersionSchema.parse(raw.package.version)
    const existing = initial.board.skills.find(version => version.id === requestedVersion.id)
    if (existing && initial.skillPackages?.[existing.id]) throw new DomainError('CONFLICT', 'Complete skill version is already imported.')
    // Immutable, account-prefixed R2 objects may be orphaned on a CAS failure; they never grant execution.
    const stored = await storeSkillPackage(this.env.SKILL_PACKAGES, actor.businessId, raw.package)
    return this.write(() => {
      const { state } = this.state(actor)
      const replay = this.receipt<MutationReceipt>(operationId, actor, requestHash)
      if (replay) return replay
      assertRevision(state.board, baseRevision)
      const prior = state.board.skills.find(version => version.id === stored.version.id)
      if (prior && canonicalJSON(prior.files) !== canonicalJSON(stored.version.files)) throw new DomainError('CONFLICT', 'Package manifest differs from the existing skill version.')
      const after = parseBoard({ ...state.board, revision: state.board.revision + 1, skills: prior ? state.board.skills : [...state.board.skills, skillVersionSchema.parse(stored.version)] })
      assertBounded(after)
      const result = this.commit(state, actor, after, { operationId, action: 'skill.import', summary: 'skill.import: 1', skillPackages: { ...state.skillPackages, [stored.version.id]: stored.manifestHash } })
      this.saveReceipt(operationId, actor, requestHash, result)
      return result
    })
  }
  async readSkill(rawActor: Actor, versionId: string): Promise<StoredSkillPackage | { version: Board['skills'][number]; available: false }> {
    const { state, actor } = this.state(rawActor)
    const version = state.board.skills.find(version => version.id === versionId)
    if (!version) throw new DomainError('NOT_FOUND', 'Skill version is not in this business.')
    if (!state.skillPackages?.[versionId]) return { version, available: false }
    const stored = await readSkillPackage(this.env.SKILL_PACKAGES, actor.businessId, version)
    if (stored && state.skillPackages[versionId] !== stored.manifestHash) throw new DomainError('INVALID', 'Skill package link does not match its manifest.')
    return stored ? { ...stored, version } : { version, available: false }
  }
}
