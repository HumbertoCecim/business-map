import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { createDb } from '@/db/client'
import { createAuth } from '@/features/auth/auth.server'
import { authorizedUser, ensureMembership, membership } from './pilot.server'
import { businessMembership } from './pilot.schema'
import { createEventHeaders, importPortableBoard, canonicalJSON, sha256 } from '@/business/domain'
import { validateSkillPackage } from '@/business/skills'
import { BusinessObject } from '@/business/object'
import { manualCommandSchema, undoSchema, type Actor } from '@/business/model'
import { createBusinessMcpResource, approvedClientIds, type BusinessMcpEnv } from '@/mcp'
import type { OAuthBinding } from '../../../oauth/src/index'
import widgetHtml from '../../../widget/dist/map.html?raw'

export type PilotBindings = Cloudflare.Env & {
  BUSINESS_OBJECTS: DurableObjectNamespace<BusinessObject>
  AUTH: Service<OAuthBinding>
  PUBLIC_APP_URL: string
  APPROVAL_SECRET: string
  SKILL_PACKAGES: R2Bucket
  PILOT_INVITE_EMAILS?: string
  PILOT_REQUIRE_EMAIL_VERIFICATION?: string
  APPROVED_CHATGPT_CLIENT_IDS?: string
}
type SiteDomain = Pick<BusinessObject, 'initialize' | 'getSnapshot' | 'manualCommand' | 'undo' | 'exportBoard' | 'importBoard' | 'importSkill' | 'readSkill' | 'preview' | 'apply' | 'reject'> & { fetch(request: Request): Promise<Response> }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status)
export async function siteIdentity(request: Request, env: PilotBindings) {
  const db = createDb(env.DB)
  const session = await createAuth(env, db).api.getSession({ headers: request.headers, query: { disableCookieCache: true } })
  if (!session) return null
  const user = await authorizedUser(db, session.user.id, env)
  return user ? { user, db } : null
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('INVALID: Envie JSON.')
  const text = await request.text()
  if (text.length > 33_000_000) throw new Error('LIMIT: Arquivo muito grande.')
  return JSON.parse(text)
}
function csrf(request: Request, env: PilotBindings) {
  return request.method === 'GET' || request.method === 'HEAD' || request.headers.get('origin') === new URL(env.PUBLIC_APP_URL).origin
}

/** Public OAuth routes bypass framework document headers; identity comes only from BetterAuth. */
export async function oauthRoute(request: Request, env: PilotBindings): Promise<Response> {
  const path = new URL(request.url).pathname
  const headers = new Headers(request.headers)
  headers.delete('x-business-user-id'); headers.delete('x-business-user-email'); headers.delete('x-business-oauth-generation')
  if (path === '/authorize') {
    const identity = await siteIdentity(request, env)
    if (!identity) {
      const target = new URL('/login', env.PUBLIC_APP_URL)
      target.searchParams.set('returnTo', new URL(request.url).pathname + new URL(request.url).search)
      return Response.redirect(target, 303)
    }
    if (!csrf(request, env)) return fail(403, 'FORBIDDEN', 'Origem inválida.')
    // No business IDs or actor claims are accepted from OAuth arguments.
    headers.set('x-business-user-id', identity.user.id)
    headers.set('x-business-user-email', identity.user.email)
    const link = await membership(identity.db, identity.user.id)
    if (!link) return fail(409, 'UNINITIALIZED', 'Crie seu negócio no site antes de conectar.')
    headers.set('x-business-oauth-generation', link.oauthGeneration)
    if (request.method === 'POST') {
      const form = await request.clone().formData()
      if (form.get('decision') === 'approve') await identity.db.update(businessMembership).set({ connectedAt: Date.now(), disconnectedAt: null }).where(eq(businessMembership.userId, identity.user.id))
    }
  }
  return env.AUTH.fetch(new Request(request, { headers }))
}

export function mcpRoute(request: Request, env: PilotBindings, ctx: ExecutionContext) {
  const resource = createBusinessMcpResource<BusinessMcpEnv>({
    publicBaseUrl: env.PUBLIC_APP_URL,
    widgetHtml: async () => widgetHtml,
    resolveSession: async (_request, _bindings, auth) => {
      const grant = auth.props
      if (!grant) return null
      const db = createDb(env.DB)
      if (!await authorizedUser(db, grant.userId, env)) return null
      const link = await membership(db, grant.userId)
      if (!link || grant.oauthGeneration !== link.oauthGeneration) return null
      const approved = approvedClientIds(env.APPROVED_CHATGPT_CLIENT_IDS)
      return { userId: grant.userId, businessId: link.businessId, clientId: grant.clientId,
        grantId: grant.grantId, scopes: grant.scopes,
        trustedChatgpt: approved.has(grant.clientId) && grant.scopes.includes('business:approve') }
    },
  })
  // Project the RPC stubs onto their public contracts; avoid recursively instantiating
  // Cloudflare's serializer types for the complete domain and OAuth entrypoints.
  const auth = env.AUTH as unknown as BusinessMcpEnv['AUTH']
  const objects = env.BUSINESS_OBJECTS as unknown as BusinessMcpEnv['BUSINESS_OBJECTS']
  return resource.fetch(request, { AUTH: auth, BUSINESS_OBJECTS: objects }, ctx)
}

export async function businessApi(request: Request, env: PilotBindings): Promise<Response> {
  if (!csrf(request, env)) return fail(403, 'FORBIDDEN', 'Origem inválida.')
  const identity = await siteIdentity(request, env)
  if (!identity) return fail(401, 'UNAUTHORIZED', 'Entre com sua conta convidada e confirme o e-mail.')
  const path = new URL(request.url).pathname.replace(/^\/api\/business/, '')
  try {
    if (path === '/account') return json({ user: { name: identity.user.name, email: identity.user.email } })
    let link = await membership(identity.db, identity.user.id)
    if (!link && path === '' && request.method === 'POST') link = await ensureMembership(identity.db, identity.user.id)
    if (!link) return fail(404, 'UNINITIALIZED', 'Seu negócio ainda não foi criado.')
    const actor: Actor = { userId: identity.user.id, businessId: link.businessId, channel: 'site' }
    const object = env.BUSINESS_OBJECTS.getByName(link.businessId) as unknown as SiteDomain
    if (path === '' && request.method === 'POST') {
      const input = z.object({ name: z.string().trim().min(1).max(300) }).strict().parse(await body(request))
      await object.initialize(actor, { operationId: `initialize-${identity.user.id}`, title: input.name })
      return json(await object.getSnapshot(actor))
    }
    if (path === '' && request.method === 'GET') return json(await object.getSnapshot(actor))
    if (path === '/events' && request.method === 'GET') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return fail(426, 'UPGRADE_REQUIRED', 'Use WebSocket.')
      return object.fetch(new Request('https://business.internal/events', { headers: { Upgrade: 'websocket', ...await createEventHeaders(actor, env.APPROVAL_SECRET) } }))
    }
    const resource = /^\/skills\/([^/]+)$/.exec(path)
    if (resource && request.method === 'GET') return json(await object.readSkill(actor, decodeURIComponent(resource[1])))
    if (request.method !== 'POST') return fail(404, 'NOT_FOUND', 'Rota não encontrada.')
    const input = await body(request)
    if (path === '/command') await object.manualCommand(actor, manualCommandSchema.parse(input))
    else if (path === '/undo') await object.undo(actor, undoSchema.parse(input))
    else if (path === '/export') return json(await object.exportBoard(actor, z.object({ format: z.enum(['json', 'markdown']) }).strict().parse(input)))
    else if (path === '/import/preview') {
      const board = importPortableBoard(input.board)
      return json({ board, hash: await sha256(canonicalJSON(board)) })
    } else if (path === '/import/confirm') {
      const board = importPortableBoard(input.board)
      if (await sha256(canonicalJSON(board)) !== input.expectedHash) return fail(409, 'CONFLICT', 'O arquivo mudou. Confira uma nova prévia.')
      await object.importBoard(actor, { operationId: input.operationId, board: input.board })
    } else if (path === '/skills/preview') return json(await validateSkillPackage(input.package))
    else if (path === '/skills/import') {
      const validated = await validateSkillPackage(input.package)
      if (validated.manifestHash !== input.expectedTreeHash) return fail(409, 'CONFLICT', 'A skill mudou. Confira uma nova prévia.')
      await object.importSkill(actor, { operationId: input.operationId, baseRevision: input.baseRevision, package: input.package })
    } else if (path === '/connections/disconnect') {
      await identity.db.update(businessMembership).set({ disconnectedAt: Date.now(), oauthGeneration: crypto.randomUUID() }).where(eq(businessMembership.userId, identity.user.id))
      await env.AUTH.revokeUserGrants(identity.user.id)
      return json({ disconnected: true })
    } else {
      const proposal = /^\/proposals\/([^/]+)\/(preview|apply|reject)$/.exec(path)
      if (!proposal) return fail(404, 'NOT_FOUND', 'Rota não encontrada.')
      const id = decodeURIComponent(proposal[1])
      if (proposal[2] === 'preview') return json(await object.preview(actor, id))
      const operation = { operationId: input.operationId, proposalId: id }
      if (proposal[2] === 'apply') await object.apply(actor, operation)
      else await object.reject(actor, operation)
    }
    return json(await object.getSnapshot(actor))
  } catch (error) {
    const code = error instanceof z.ZodError || error instanceof SyntaxError ? 'INVALID' : /(?:^|Error: )(UNINITIALIZED|NOT_FOUND|FORBIDDEN|CONFLICT|EXPIRED|INVALID|LIMIT):/.exec(String(error))?.[1] ?? 'INTERNAL'
    const status = { UNINITIALIZED: 404, NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409, EXPIRED: 409, INVALID: 400, LIMIT: 413, INTERNAL: 500 }[code] ?? 500
    const message = { UNINITIALIZED: 'Seu negócio ainda não foi criado.', NOT_FOUND: 'Item não encontrado neste negócio.', FORBIDDEN: 'Esta ação não está autorizada.', CONFLICT: 'O mapa ou a prévia mudou. Atualize antes de confirmar.', EXPIRED: 'A confirmação expirou. Abra uma nova prévia.', INVALID: 'Revise os dados enviados.', LIMIT: 'O arquivo ou operação excede os limites.', INTERNAL: 'Não foi possível concluir. Tente novamente.' }[code]
    // No payloads, OAuth codes, model text or tokens are logged.
    if (status === 500) console.error('[business-api]', code)
    return fail(status, code, message ?? 'Não foi possível concluir.')
  }
}
