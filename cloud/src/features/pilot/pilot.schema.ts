import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '@/features/auth/auth.schema'

export const pilotInvite = sqliteTable('pilot_invite', {
  email: text('email').primaryKey(),
  status: text('status').notNull().default('active'),
  expiresAt: integer('expires_at'),
  createdAt: integer('created_at').notNull(),
})
export const businessMembership = sqliteTable('business_membership', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  businessId: text('business_id').notNull().unique(),
  oauthGeneration: text('oauth_generation').notNull(),
  connectedAt: integer('connected_at'),
  disconnectedAt: integer('disconnected_at'),
  createdAt: integer('created_at').notNull(),
})
