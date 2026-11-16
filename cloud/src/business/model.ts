import { z } from 'zod'
import { commandSchema, type Board, type Command as SharedCommand } from '../../../shared/model'

export { boardSchema, cardSchema, sectionSchema, sourceSchema, relationSchema, memorySchema } from '../../../shared/model'
export type { Board, Card, Section, Target } from '../../../shared/model'

const allowed = new Set([
  'title', 'section.save', 'section.delete', 'section.move', 'card.save', 'card.delete',
  'card.move', 'relation.save', 'relation.delete', 'source.save', 'source.delete',
  'focus', 'whereStopped', 'memory.save', 'memory.delete', 'structure.apply',
  'suggestion.status', 'map.apply', 'skill.select',
])
type AllowedType = 'title' | 'section.save' | 'section.delete' | 'section.move' |
  'card.save' | 'card.delete' | 'card.move' | 'relation.save' | 'relation.delete' |
  'source.save' | 'source.delete' | 'focus' | 'whereStopped' | 'memory.save' |
  'memory.delete' | 'structure.apply' | 'suggestion.status' | 'map.apply' | 'skill.select'
export type ChangeCommand = Extract<SharedCommand, { type: AllowedType }>
export type Command = ChangeCommand
// Parse only known commands, reject unknown top-level fields, and never expose runtime commands.
export const changeCommandSchema = z.union(
  commandSchema.options.filter(option => allowed.has(option.shape.type.value)).map(option => option.strict()),
) as z.ZodType<ChangeCommand>
export const commandBatchSchema = z.array(changeCommandSchema).min(1).max(100)
export const actorSchema = z.object({
  userId: z.string().min(1).max(160),
  businessId: z.string().min(1).max(160),
  channel: z.enum(['site', 'chatgpt', 'external']),
  clientId: z.string().min(1).max(200).optional(),
  grantId: z.string().min(1).max(200).optional(),
}).strict()
export type Actor = z.infer<typeof actorSchema>
export const operationIdSchema = z.string().min(8).max(160)
export const revisionSchema = z.number().int().nonnegative()
export const proposeSchema = z.object({
  operationId: operationIdSchema,
  baseRevision: revisionSchema,
  title: z.string().trim().min(1).max(500),
  rationale: z.string().max(30000),
  commands: commandBatchSchema,
}).strict()
export type ProposeInput = z.infer<typeof proposeSchema>
export const manualCommandSchema = z.object({
  operationId: operationIdSchema, baseRevision: revisionSchema, commands: commandBatchSchema,
}).strict()
export type ManualCommandInput = z.infer<typeof manualCommandSchema>
export const proposalMutationSchema = z.object({
  operationId: operationIdSchema,
  proposalId: z.string().min(1).max(160),
  capability: z.string().max(8000).optional(),
}).strict()
export type ProposalMutationInput = z.infer<typeof proposalMutationSchema>
export const undoSchema = z.object({
  operationId: operationIdSchema, transactionId: z.string().min(1).max(160),
  baseRevision: revisionSchema, capability: z.string().max(8000).optional(),
}).strict()
export type UndoInput = z.infer<typeof undoSchema>
export const approvalRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('apply'), proposalId: z.string().min(1).max(160), ttlSeconds: z.number().int().min(1).max(300).optional() }).strict(),
  z.object({ action: z.literal('reject'), proposalId: z.string().min(1).max(160), ttlSeconds: z.number().int().min(1).max(300).optional() }).strict(),
  z.object({ action: z.literal('undo'), transactionId: z.string().min(1).max(160), baseRevision: revisionSchema, ttlSeconds: z.number().int().min(1).max(300).optional() }).strict(),
])
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>
export type Proposal = {
  id: string; title: string; rationale: string; baseRevision: number
  commands: ChangeCommand[]; hash: string; status: 'pending' | 'applied' | 'rejected'
  createdAt: string; createdBy: Actor; resolvedAt?: string; transactionId?: string
}
export type MutationReceipt = {
  operationId: string; businessId: string; action: 'initialize' | 'manual' | 'apply' | 'reject' | 'undo' | 'import' | 'skill.import'
  revision: number; at: string; transactionId?: string; proposalId?: string
}
export type AuditEntry = {
  transactionId: string; action: MutationReceipt['action']; revision: number
  at: string; summary: string; actor: Actor; proposalId?: string
}
export type Snapshot = {
  businessId: string; fingerprint: string; board: Board; proposals: Proposal[]
  audit: AuditEntry[]; lastTransactionId: string | null
}
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type PreviewChange = { path: string; before: JsonValue; after: JsonValue }
export type ProposalPreview = {
  proposal: Proposal; before: Board; after: Board | null; stale: boolean; changes: PreviewChange[]
}
export type ApprovalCapability = {
  version: 1; actor: Actor; action: 'apply' | 'reject' | 'undo'; targetId: string
  hash: string; baseRevision: number; expiresAt: number; nonce: string
}
export type ApprovalResult = { capability: string; expiresAt: string }
export type SkillPackageInput = {
  version: unknown; files: { path: string; encoding: 'utf8' | 'base64'; content: string }[]
}
export class DomainError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'EXPIRED' | 'UNINITIALIZED' | 'LIMIT', message: string) {
    super(`${code}: ${message}`)
    this.name = 'DomainError'
  }
}
