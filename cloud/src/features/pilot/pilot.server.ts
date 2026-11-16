import { eq } from 'drizzle-orm'
import type { DB } from '@/db/client'
import { user } from '@/features/auth/auth.schema'
import { pilotInvite, businessMembership } from './pilot.schema'
import { isInvitedEmail, normalizeEmail } from './access'

type PilotEnv = { PILOT_INVITE_EMAILS?: string; ADMIN_EMAILS?: string }
export async function hasPilotInvite(db: DB, email: string, env: PilotEnv): Promise<boolean> {
  const normalized = normalizeEmail(email)
  const row = await db.select().from(pilotInvite).where(eq(pilotInvite.email, normalized)).get()
  // An explicit revocation takes precedence over the bootstrap allowlist.
  if (row) return row.status === 'active' && (row.expiresAt === null || row.expiresAt > Date.now())
  return isInvitedEmail(normalized, env.PILOT_INVITE_EMAILS, env.ADMIN_EMAILS)
}
export async function authorizedUser(db: DB, userId: string, env: PilotEnv) {
  const row = await db.select().from(user).where(eq(user.id, userId)).get()
  if (!row || row.banned || !row.emailVerified || !await hasPilotInvite(db, row.email, env)) return null
  return row
}
export async function membership(db: DB, userId: string) {
  return db.select().from(businessMembership).where(eq(businessMembership.userId, userId)).get()
}
export async function ensureMembership(db: DB, userId: string) {
  const existing = await membership(db, userId)
  if (existing) return existing
  await db.insert(businessMembership).values({ userId, businessId: `business-${crypto.randomUUID()}`, oauthGeneration: crypto.randomUUID(), createdAt: Date.now() }).onConflictDoNothing()
  return (await membership(db, userId))!
}
