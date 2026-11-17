import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { createDb } from '@/db/client'
import { createAuth } from '@/features/auth/auth.server'
import { account, session, user } from '@/features/auth/auth.schema'
import { OAuthBinding } from '../../../oauth/src/index'
import { businessApi, oauthRoute, siteIdentity, type PilotBindings } from './http'
import { hasPilotInvite, authorizedUser, ensureMembership } from './pilot.server'
import { businessMembership, pilotInvite } from './pilot.schema'
import { isInvitedEmail, safeReturnTo } from './access'

type TestBindings = PilotBindings & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1]; OAUTH_KV: KVNamespace; OAUTH_ISSUER: string; MCP_SERVER_URL: string }
const bindings = env as unknown as TestBindings
const origin = 'https://pilot.example.test'
let fixtureIndex = 0
// Compose the real private OAuth implementation. No external provider or identity test double is used.
function withOAuth(): TestBindings {
  return { ...bindings, AUTH: new OAuthBinding(createExecutionContext(), bindings) as unknown as PilotBindings['AUTH'] }
}
beforeAll(async () => { await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS) })
beforeEach(async () => {
  // The current Workers pool keeps D1 between tests. Clear only this harness's tables;
  // foreign-key cascades remove account/session/membership rows without rebuilding migrations.
  await db().delete(user)
  await db().delete(pilotInvite)
})
const db = () => createDb(bindings.DB)
async function invite(email: string, status = 'active', expiresAt: number | null = null) {
  await db().insert(pilotInvite).values({ email, status, expiresAt, createdAt: Date.now() })
}
function request(path: string, options: { method?: string; body?: unknown; cookie?: string; origin?: string | null; headers?: Record<string, string> } = {}) {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST')
  return new Request(`${origin}${path}`, { method, headers: {
    ...(options.origin !== null ? { origin: options.origin ?? origin } : {}),
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    'cf-connecting-ip': '192.0.2.10', ...options.headers,
  }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) })
}
async function signedIn(email = `person-${crypto.randomUUID()}@example.test`) {
  await invite(email)
  const auth = createAuth(bindings, db()), context = await auth.$context
  const created = await context.internalAdapter.createUser({ name: 'Invited Person', email, emailVerified: true })
  await context.internalAdapter.createAccount({ accountId: created.id, providerId: 'credential', userId: created.id, password: await context.password.hash('A-test-password-42!') })
  const response = await auth.handler(request('/api/auth/sign-in/email', { body: { email, password: 'A-test-password-42!' }, headers: { 'cf-connecting-ip': `198.51.100.${++fixtureIndex}` } }))
  expect(response.status).toBe(200)
  const cookies = response.headers.get('set-cookie') ?? ''
  const cookie = /((?:__Secure-)?better-auth\.session_token=[^;]+)/.exec(cookies)?.[1]
  expect(cookie).toBeTruthy()
  return { id: created.id, email, cookie: cookie!, auth }
}
describe('closed invite admission and fresh account checks on actual D1', () => {
  test('bootstrap/admin email normalization and return paths fail closed', () => {
    expect(isInvitedEmail('  BOOTSTRAP@example.test ', bindings.PILOT_INVITE_EMAILS)).toBe(true)
    expect(isInvitedEmail('Admin@Example.Test', undefined, bindings.ADMIN_EMAILS)).toBe(true)
    expect(isInvitedEmail('outsider@example.test', bindings.PILOT_INVITE_EMAILS)).toBe(false)
    for (const unsafe of ['https://evil.test', '//evil.test', '/\\evil.test']) expect(safeReturnTo(unsafe)).toBe('/business')
  })
  test('explicit expired/revoked invitation overrides bootstrap and unknown statuses are denied', async () => {
    await invite('revoked-bootstrap@example.test', 'revoked')
    await invite('expired-bootstrap@example.test', 'active', Date.now() - 1)
    await invite('bad-status@example.test', 'pending')
    expect(await hasPilotInvite(db(), 'revoked-bootstrap@example.test', bindings)).toBe(false)
    expect(await hasPilotInvite(db(), 'expired-bootstrap@example.test', bindings)).toBe(false)
    expect(await hasPilotInvite(db(), 'bad-status@example.test', bindings)).toBe(false)
    expect(await hasPilotInvite(db(), 'bootstrap@example.test', bindings)).toBe(true)
  })
  test('password signup for an outsider returns403 before any user/account is created', async () => {
    const email = 'outside-signup@example.test'
    const response = await createAuth(bindings, db()).handler(request('/api/auth/sign-up/email', { body: { email, name: 'Outsider', password: 'A-test-password-42!' } }))
    expect(response.status).toBe(403)
    expect(await db().select().from(user).where(eq(user.email, email)).get()).toBeUndefined()
    expect((await db().select().from(account)).length).toBe(0)
  })
  test('invited password signup creates an unverified account without admitting a site session', async () => {
    const email = 'invited-signup@example.test'
    await invite(email)
    const response = await createAuth(bindings, db()).handler(request('/api/auth/sign-up/email', { body: { email, name: 'Invited Signup', password: 'A-test-password-42!' }, headers: { 'cf-connecting-ip': `198.51.100.${++fixtureIndex}` } }))
    expect(response.status).toBe(200)
    const created = await db().select().from(user).where(eq(user.email, email)).get()
    expect(created).toBeTruthy()
    expect(created!.emailVerified).toBe(false)
    expect(await authorizedUser(db(), created!.id, bindings)).toBeNull()
    expect((await db().select().from(session).where(eq(session.userId, created!.id))).length).toBe(0)
  })
  test('revoked and expired bootstrap addresses cannot create password or social accounts', async () => {
    const auth = createAuth(bindings, db()), context = await auth.$context
    for (const [email, status, expiresAt] of [
      ['revoked-bootstrap@example.test', 'revoked', null],
      ['expired-bootstrap@example.test', 'active', Date.now() - 1],
    ] as const) {
      await invite(email, status, expiresAt)
      const response = await auth.handler(request('/api/auth/sign-up/email', { body: { email, name: 'No admission', password: 'A-test-password-42!' }, headers: { 'cf-connecting-ip': `198.51.100.${++fixtureIndex}` } }))
      expect(response.status).toBe(403)
      await expect(context.internalAdapter.createOAuthUser({ name: 'No social admission', email, emailVerified: true }, { providerId: 'github', accountId: email })).rejects.toThrow('convite')
      expect(await db().select().from(user).where(eq(user.email, email)).get()).toBeUndefined()
    }
    expect((await db().select().from(account)).length).toBe(0)
  })
  test('the actual social-user creation adapter runs the same invite hook before writes', async () => {
    const auth = createAuth(bindings, db()), context = await auth.$context
    await expect(context.internalAdapter.createOAuthUser({ name: 'Outsider Social', email: 'social-outsider@example.test', emailVerified: true }, { providerId: 'google', accountId: 'outside-google' })).rejects.toThrow('convite')
    expect(await db().select().from(user).where(eq(user.email, 'social-outsider@example.test')).get()).toBeUndefined()
    expect((await db().select().from(account)).length).toBe(0)
    await invite('social-invited@example.test')
    const social = await context.internalAdapter.createOAuthUser({ name: 'Invited Social', email: 'social-invited@example.test', emailVerified: true }, { providerId: 'google', accountId: 'inside-google' })
    expect(social.user.email).toBe('social-invited@example.test')
    expect(social.account.providerId).toBe('google')
    expect(await authorizedUser(db(), social.user.id, bindings)).toBeTruthy()
  })
  test('fresh verified, invited user authorization rejects missing, banned and unverified users', async () => {
    const person = await signedIn()
    expect((await authorizedUser(db(), person.id, bindings))?.id).toBe(person.id)
    expect(await authorizedUser(db(), 'missing-person', bindings)).toBeNull()
    await db().update(user).set({ banned: true }).where(eq(user.id, person.id))
    expect(await authorizedUser(db(), person.id, bindings)).toBeNull()
    await db().update(user).set({ banned: false, emailVerified: false }).where(eq(user.id, person.id))
    expect(await authorizedUser(db(), person.id, bindings)).toBeNull()
  })
})
describe('authenticated site API boundary', () => {
  test('anonymous and forged identity requests cannot access or initialize a business', async () => {
    const forged = { 'x-business-user-id': 'owner', 'x-business-business-id': 'other', 'x-business-user-email': 'admin@example.test' }
    expect((await businessApi(request('/api/business', { headers: forged }), withOAuth())).status).toBe(401)
    expect((await businessApi(request('/api/business', { body: { name: 'Forged' }, headers: forged }), withOAuth())).status).toBe(401)
    expect((await db().select().from(businessMembership)).length).toBe(0)
  })
  test('wrong or missing origin blocks authenticated site mutations before writes', async () => {
    const person = await signedIn()
    for (const suppliedOrigin of ['https://evil.example', null]) {
      const response = await businessApi(request('/api/business', { cookie: person.cookie, origin: suppliedOrigin, body: { name: 'Wrong origin' } }), withOAuth())
      expect(response.status).toBe(403)
    }
    expect((await db().select().from(businessMembership)).length).toBe(0)
  })
  test('two users receive fixed separate object IDs and payload actor/business claims are refused', async () => {
    const first = await signedIn(), second = await signedIn()
    const created1 = await businessApi(request('/api/business', { cookie: first.cookie, body: { name: 'First business' } }), withOAuth())
    const created2 = await businessApi(request('/api/business', { cookie: second.cookie, body: { name: 'Second business' } }), withOAuth())
    expect(created1.status).toBe(200); expect(created2.status).toBe(200)
    const a = await created1.json() as { businessId: string; board: { title: string; revision: number } }
    const b = await created2.json() as typeof a
    expect(a.businessId).not.toBe(b.businessId)
    expect((await ensureMembership(db(), first.id)).businessId).toBe(a.businessId)
    const forged = await businessApi(request('/api/business/command', { cookie: first.cookie, body: { operationId: crypto.randomUUID(), baseRevision: 0, businessId: b.businessId, actor: { userId: second.id }, commands: [{ type: 'title', title: 'Cross-account' }] } }), withOAuth())
    expect(forged.status).toBe(400)
    const read = await businessApi(request(`/api/business?businessId=${encodeURIComponent(b.businessId)}`, { cookie: first.cookie, headers: { 'x-business-user-id': second.id } }), withOAuth())
    const own = await read.json() as typeof a
    expect(own.businessId).toBe(a.businessId)
    expect(own.board.title).toBe('First business')
    const other = await businessApi(request('/api/business', { cookie: second.cookie }), withOAuth())
    expect((await other.json() as typeof a).board.title).toBe('Second business')
  })
  test('existing signed cookies immediately lose API access after invite revocation, ban, unverification and session expiration', async () => {
    const person = await signedIn()
    expect(await siteIdentity(request('/api/business', { cookie: person.cookie }), bindings)).toBeTruthy()
    await db().update(pilotInvite).set({ status: 'revoked' }).where(eq(pilotInvite.email, person.email))
    expect((await businessApi(request('/api/business', { cookie: person.cookie }), withOAuth())).status).toBe(401)
    await db().update(pilotInvite).set({ status: 'active' }).where(eq(pilotInvite.email, person.email))
    await db().update(user).set({ banned: true }).where(eq(user.id, person.id))
    expect((await businessApi(request('/api/business', { cookie: person.cookie }), withOAuth())).status).toBe(401)
    await db().update(user).set({ banned: false, emailVerified: false }).where(eq(user.id, person.id))
    expect((await businessApi(request('/api/business', { cookie: person.cookie }), withOAuth())).status).toBe(401)
    await db().update(user).set({ emailVerified: true }).where(eq(user.id, person.id))
    await db().update(session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(session.userId, person.id))
    expect((await businessApi(request('/api/business', { cookie: person.cookie }), withOAuth())).status).toBe(401)
  })
})
describe('public OAuth proxy derives identity from the signed site session', () => {
  test('forged external identity headers cannot authorize and are redirected to sign in', async () => {
    const response = await oauthRoute(request('/authorize?client_id=attacker', { headers: { 'x-business-user-id': 'admin', 'x-business-user-email': 'admin@example.test', 'x-business-oauth-generation': 'forged-generation' } }), withOAuth())
    expect(response.status).toBe(303)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login')
  })
  test('real OAuth DCR and consent use authenticated membership identity despite forged request headers', async () => {
    const oauth = withOAuth()
    const registered = await oauthRoute(request('/register', { body: { client_name: 'Pilot test client', redirect_uris: ['https://client.example.test/callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }, headers: { 'x-business-user-id': 'injected' } }), oauth)
    expect(registered.status).toBe(201)
    const client = await registered.json() as { client_id: string }
    const person = await signedIn()
    await businessApi(request('/api/business', { cookie: person.cookie, body: { name: 'Consent owner' } }), oauth)
    const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: 'https://client.example.test/callback', response_type: 'code', scope: 'business:read business:propose', state: 'test-state', code_challenge: 'A'.repeat(43), code_challenge_method: 'S256', resource: `${origin}/mcp` })
    const consent = await oauthRoute(request(`/authorize?${params}`, { cookie: person.cookie, headers: { 'x-business-user-id': 'injected', 'x-business-user-email': 'evil@example.test', 'x-business-oauth-generation': 'forged-generation' } }), oauth)
    expect(consent.status).toBe(200)
    const html = await consent.text()
    expect(html).toContain(person.email)
    expect(html).not.toContain('evil@example.test')
    expect(html).not.toContain('forged-generation')
    const crossOrigin = await oauthRoute(request('/authorize', { method: 'POST', cookie: person.cookie, origin: 'https://evil.example', body: { decision: 'approve' } }), oauth)
    expect(crossOrigin.status).toBe(403)
  })
})
