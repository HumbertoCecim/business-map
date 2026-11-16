import { boardSchema, emptyBoard, parseBoard, reduceBoard, hasTarget, type Board } from '../../../shared/model'
import { exportMarkdown } from '../../../shared/export'
import { actorSchema, commandBatchSchema, DomainError, type Actor, type ApprovalCapability, type ChangeCommand, type JsonValue, type PreviewChange } from './model'

const encoder = new TextEncoder()
// Leave room for the enclosing state, latest undo snapshot, and SQLite row encoding.
export const MAX_BOARD_BYTES = 4_000_000
export function assertBounded(value: unknown, maximum = MAX_BOARD_BYTES): void {
  if (encoder.encode(JSON.stringify(value)).length > maximum) throw new DomainError('LIMIT', 'Payload is too large.')
}
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function assertActor(raw: Actor, owner: { userId: string; businessId: string }): Actor {
  const actor = actorSchema.parse(raw)
  if (actor.userId !== owner.userId || actor.businessId !== owner.businessId) throw new DomainError('FORBIDDEN', 'Business belongs to another account.')
  if (actor.channel !== 'site' && (!actor.clientId || !actor.grantId)) throw new DomainError('FORBIDDEN', 'An external actor must identify its client and grant.')
  return actor
}
export function assertSite(actor: Actor): void {
  if (actor.channel !== 'site') throw new DomainError('FORBIDDEN', 'This operation requires the signed-in site.')
}
export function assertRevision(board: Board, baseRevision: number): void {
  if (board.revision !== baseRevision) throw new DomainError('CONFLICT', `Board changed; expected revision ${baseRevision}, current revision ${board.revision}. Refresh and review again.`)
}
export function applyBatch(board: Board, raw: ChangeCommand[], baseRevision: number): Board {
  assertRevision(board, baseRevision)
  assertBounded(raw, 2_000_000)
  const commands = commandBatchSchema.parse(raw)
  let after = structuredClone(board)
  for (const command of commands) after = reduceBoard(after, command)
  after.revision = board.revision + 1
  // Shared reducer preserves stale imported memory references; cloud mutations must not create new dangling references.
  const oldMemories = new Map(board.memories.map(memory => [memory.id, canonicalJSON(memory)]))
  for (const memory of after.memories) {
    if (!hasTarget(after, memory.target) && oldMemories.get(memory.id) !== canonicalJSON(memory)) throw new DomainError('INVALID', 'Memory target is missing.')
  }
  const parsed = parseBoard(after)
  assertBounded(parsed)
  return parsed
}
export function newBoard(businessId: string, title?: string): Board {
  return boardSchema.parse({ ...emptyBoard(businessId), title: title ?? 'Meu negócio' })
}
export function commandSummary(commands: ChangeCommand[]): string {
  const counts = new Map<string, number>()
  for (const command of commands) counts.set(command.type, (counts.get(command.type) ?? 0) + 1)
  return [...counts].map(([type, count]) => `${type}: ${count}`).join(', ').slice(0, 500)
}
export function portableURL(value: string | undefined): string | undefined {
  if (!value) return value
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[::1\])/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) return undefined
    url.username = ''; url.password = ''
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (/token|secret|password|credential|api.?key|authorization/i.test(key)) url.searchParams.delete(key)
    return url.toString()
  } catch { return undefined }
}
/** A copy, never an update of a local file or a connection to a local runtime. */
export function importPortableBoard(raw: unknown, revision = 1): Board {
  assertBounded(raw)
  const board = parseBoard(raw)
  for (const ids of [board.memories.map(item => item.id), board.skills.map(item => item.id), board.sessions.map(item => item.id)]) {
    if (new Set(ids).size !== ids.length) throw new DomainError('INVALID', 'Import contains duplicate memory, skill, or session IDs.')
  }
  const skillIds = new Set(board.skills.map(skill => skill.id))
  if (board.selectedSkillVersionIds.some(id => !skillIds.has(id))) throw new DomainError('INVALID', 'Selected skill version is missing from the import.')
  board.revision = revision
  board.agent.id = null
  board.agent.skills = []
  board.agent.endOfConversation = false
  board.currentSessionId = null
  board.receipts = {}
  for (const session of board.sessions) {
    // No local runtime remains attached. Use an existing source timestamp so preview/confirm hashes agree.
    if (session.status !== 'closed') { session.status = 'closed'; session.closedAt ??= session.startedAt }
    session.grilling = 'off'
  }
  for (const suggestion of board.suggestions) {
    delete suggestion.sourcePath
    suggestion.sourceUrl = portableURL(suggestion.sourceUrl)
    if (suggestion.mapDraft) for (const source of suggestion.mapDraft.sources) source.url = portableURL(source.url)
  }
  for (const skill of board.skills) { skill.sourcePath = ''; skill.sourceUrl = portableURL(skill.sourceUrl) ?? '' }
  for (const source of board.sources ?? []) source.url = portableURL(source.url)
  return parseBoard(board)
}
export function isEmptyBoard(board: Board): boolean {
  return board.revision === 0 && !board.sections.length && !board.suggestions.length && !board.memories.length && !board.skills.length && !board.sessions.length && !(board.sources?.length) && !(board.relations?.length)
}
export function boardChanges(before: Board, after: Board): PreviewChange[] {
  const changes: PreviewChange[] = []
  const visit = (a: unknown, b: unknown, path: string) => {
    if (canonicalJSON(a) === canonicalJSON(b)) return
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (key !== 'revision') visit((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}/${key}`)
      }
    } else changes.push({ path, before: (a ?? null) as JsonValue, after: (b ?? null) as JsonValue })
  }
  visit(before, after, '')
  return changes
}
export function exportPortable(board: Board, format: 'json' | 'markdown'): { content: string; contentType: string; filename: string } {
  return format === 'markdown'
    ? { content: exportMarkdown(board), contentType: 'text/markdown; charset=utf-8', filename: 'business-map.md' }
    : { content: JSON.stringify(board, null, 2), contentType: 'application/json; charset=utf-8', filename: 'business-map.json' }
}
function base64url(bytes: Uint8Array): string {
  let value = ''; for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function decode64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new DomainError('INVALID', 'Malformed approval capability.')
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}
async function hmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new DomainError('INVALID', 'Approval signing secret must have at least 32 characters.')
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}
export async function signCapability(payload: ApprovalCapability, secret: string): Promise<string> {
  const data = encoder.encode(canonicalJSON(payload))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), data)
  return `${base64url(data)}.${base64url(new Uint8Array(signature))}`
}
export async function verifyCapability(token: string, secret: string, actor: Actor, expected: Pick<ApprovalCapability, 'action' | 'targetId' | 'hash' | 'baseRevision'>, now = Date.now()): Promise<ApprovalCapability> {
  try {
    if (token.length > 8000) throw new Error('size')
    const parts = token.split('.')
    if (parts.length !== 2) throw new Error('parts')
    const data = decode64(parts[0]), signature = decode64(parts[1])
    if (!await crypto.subtle.verify('HMAC', await hmacKey(secret), signature as BufferSource, data as BufferSource)) throw new Error('signature')
    const payload = JSON.parse(new TextDecoder().decode(data)) as ApprovalCapability
    if (payload.version !== 1 || canonicalJSON(payload.actor) !== canonicalJSON(actor) || payload.action !== expected.action || payload.targetId !== expected.targetId || payload.hash !== expected.hash || payload.baseRevision !== expected.baseRevision || typeof payload.nonce !== 'string') throw new Error('binding')
    if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now || payload.expiresAt > now + 300_000) throw new DomainError('EXPIRED', 'Approval expired. Open a new preview.')
    return payload
  } catch (error) {
    if (error instanceof DomainError && error.code === 'EXPIRED') throw error
    throw new DomainError('FORBIDDEN', 'Invalid approval capability.')
  }
}

/** Worker-to-DO proof for authenticated site WebSocket upgrades. Never accepted as an approval. */
export async function createEventHeaders(actor: Actor, secret: string, now = Date.now()): Promise<Record<string, string>> {
  const encodedActor = base64url(encoder.encode(canonicalJSON(actorSchema.parse(actor))))
  const timestamp = String(now)
  const bytes = encoder.encode(`business-events-v1\n${timestamp}\n${encodedActor}`)
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), bytes))
  return { 'x-business-actor': encodedActor, 'x-business-timestamp': timestamp, 'x-business-signature': base64url(signature) }
}
export async function verifyEventHeaders(headers: Headers, secret: string, now = Date.now()): Promise<Actor> {
  try {
    const encodedActor = headers.get('x-business-actor') ?? ''
    const timestamp = headers.get('x-business-timestamp') ?? ''
    const signature = headers.get('x-business-signature') ?? ''
    if (encodedActor.length > 2000 || signature.length > 200 || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 30_000) throw new Error('expired')
    const bytes = encoder.encode(`business-events-v1\n${timestamp}\n${encodedActor}`)
    if (!await crypto.subtle.verify('HMAC', await hmacKey(secret), decode64(signature) as BufferSource, bytes)) throw new Error('signature')
    return actorSchema.parse(JSON.parse(new TextDecoder().decode(decode64(encodedActor))))
  } catch { throw new DomainError('FORBIDDEN', 'Invalid site event subscription proof.') }
}
