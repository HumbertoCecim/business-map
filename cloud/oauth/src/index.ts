import { WorkerEntrypoint } from 'cloudflare:workers'
import { AuthorizationError, OAuthAuthorizationServer, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { approvedClientIds, BUSINESS_SCOPES, canonicalUrl, consentScopes, escapeHtml } from './policy'
import { ensureChatgptClient } from './chatgpt-client'

export interface OAuthEnv {
  OAUTH_KV: KVNamespace
  OAUTH_ISSUER: string
  MCP_SERVER_URL: string
  APPROVED_CHATGPT_CLIENT_IDS?: string
}

export interface ValidatedGrant {
  userId: string
  clientId: string
  grantId: string
  scopes: string[]
  resource: string
  expiresAt: number
  oauthGeneration: string
  authorizedAt: number
}

export function createOAuthAuthorizationServer(env: OAuthEnv) {
  const issuer = canonicalUrl(env.OAUTH_ISSUER)
  return new OAuthAuthorizationServer<OAuthEnv>({
    issuer,
    authorizeEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/token`,
    clientRegistrationEndpoint: `${issuer}/register`,
    resources: [canonicalUrl(env.MCP_SERVER_URL)],
    scopesSupported: [...BUSINESS_SCOPES],
    accessTokenTTL: 900,
    refreshTokenTTL: 60 * 60 * 24 * 7,
    clientRegistrationTTL: 60 * 60 * 24 * 30,
    allowTokenExchangeGrant: false,
    allowPrivateUseRedirectUris: false,
    // DCR names are self-asserted. Only an operator-approved client ID may receive app approval rights.
    clientIdMetadataDocumentEnabled: false,
    tokenExchangeCallback: async ({ userId, clientId, grantId, resource, requestedScope, props }) => {
      if (typeof props?.oauthGeneration !== 'string' || typeof props?.authorizedAt !== 'number') throw new Error('Authorization generation is missing')
      return {
        accessTokenProps: { userId, clientId, grantId, resource, oauthGeneration: props.oauthGeneration, authorizedAt: props.authorizedAt },
        accessTokenScope: consentScopes(requestedScope, approvedClientIds(env.APPROVED_CHATGPT_CLIENT_IDS).has(clientId)),
      }
    },
  })
}

async function consentKey(handle: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(handle))
  return `business-consent:${Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('')}`
}

function requirePkce(request: AuthRequest, env: OAuthEnv) {
  if (request.responseType !== 'code' || request.codeChallengeMethod !== 'S256' || !request.codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(request.codeChallenge)) throw new Error('PKCE S256 obrigatório')
  if (request.resource !== canonicalUrl(env.MCP_SERVER_URL)) throw new Error('Recurso inválido')
  if (!request.state || request.state.length > 2048) throw new Error('State obrigatório')
  if (request.scope.some((scope) => !BUSINESS_SCOPES.includes(scope as typeof BUSINESS_SCOPES[number]))) throw new Error('Escopo inválido')
}

function page(content: string, headers = new Headers(), status = 200) {
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorizar · Business Map</title><style>body{font:16px system-ui;background:#f4f3ef;color:#14281f;margin:0;padding:32px}main{max-width:580px;margin:6vh auto;background:white;padding:32px;border-radius:18px}h1{font-size:27px}p,li{line-height:1.6}code{overflow-wrap:anywhere}button{font:inherit;padding:12px 18px;border:1px solid #c5ccc7;border-radius:10px;background:white;cursor:pointer;margin:8px 8px 0 0}button[value=approve]{background:#145b45;color:white}small{color:#52655a}</style><main>${content}</main></html>`, { status, headers })
}

async function authorize(request: Request, env: OAuthEnv, api: OAuthHelpers) {
  // This worker has no public route. Only the main worker may supply these identity headers
  // after authenticating BetterAuth and checking pilot membership.
  const userId = request.headers.get('x-business-user-id')
  const email = request.headers.get('x-business-user-email') ?? ''
  const oauthGeneration = request.headers.get('x-business-oauth-generation')
  if (!userId || userId.includes(':') || userId.length > 256 || !oauthGeneration || oauthGeneration.length < 8 || oauthGeneration.length > 200) return page('<h1>Sessão necessária</h1><p>Entre no Business Map e tente conectar novamente.</p>', undefined, 401)
  if (request.method === 'GET') {
    const authRequest = await api.parseAuthRequest(request)
    requirePkce(authRequest, env)
    const description = await api.describeConsent(authRequest)
    const approved = approvedClientIds(env.APPROVED_CHATGPT_CLIENT_IDS).has(authRequest.clientId)
    const scope = consentScopes(authRequest.scope, approved)
    if (!scope.includes('business:read')) return page('<h1>Permissão necessária</h1><p>O conector deve solicitar business:read.</p>', undefined, 400)
    const transaction = await api.beginConsent(authRequest)
    await env.OAUTH_KV.put(await consentKey(transaction.handle), JSON.stringify({ userId, scope, oauthGeneration }), { expirationTtl: 600 })
    return page(`<h1>Conectar seu mapa</h1><p>Você está conectado como <strong>${escapeHtml(email || userId)}</strong>.</p><p>Aplicativo: <strong>${escapeHtml(description.clientName)}</strong> <small>(nome informado pelo cliente)</small></p><p>ID do cliente: <code>${escapeHtml(authRequest.clientId)}</code></p><p>Destino da autorização: <code>${escapeHtml(description.redirectHost)}</code></p><p>Permissões:</p><ul>${scope.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><p>${approved ? 'Este cliente foi aprovado para exibir a confirmação no ChatGPT. Alterações exigem seu clique no mapa.' : 'Este cliente pode consultar e propor. Confirme alterações no site do Business Map.'}</p><p>Você pode revogar a conexão a qualquer momento no site.</p><form method="post" action="/authorize"><input type="hidden" name="handle" value="${escapeHtml(transaction.handle)}"><button name="decision" value="approve" type="submit">Autorizar conexão</button><button name="decision" value="deny" type="submit">Cancelar</button></form>`, transaction.headers)
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } })
  if (request.headers.get('origin') !== new URL(env.OAUTH_ISSUER).origin) return page('<h1>Origem inválida</h1>', undefined, 403)
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return page('<h1>Formulário inválido</h1>', undefined, 415)
  const form = await request.clone().formData()
  const handle = form.get('handle')
  if (typeof handle !== 'string' || handle.length > 2048) return page('<h1>Confirmação inválida</h1>', undefined, 400)
  const key = await consentKey(handle)
  const saved = await env.OAUTH_KV.get<{ userId: string; scope: string[]; oauthGeneration: string }>(key, 'json')
  if (!saved || saved.userId !== userId || saved.oauthGeneration !== oauthGeneration) return page('<h1>Confirmação expirada</h1><p>Conecte novamente a partir do ChatGPT.</p>', undefined, 403)
  if (form.get('decision') === 'deny') {
    const denied = await api.denyConsent(request, handle)
    await env.OAUTH_KV.delete(key)
    return new Response(null, { status: 303, headers: denied.headers })
  }
  if (form.get('decision') !== 'approve') return page('<h1>Escolha inválida</h1>', undefined, 400)
  const approved = await api.approveConsent(request, handle, { scope: saved.scope })
  requirePkce(approved.request, env)
  await env.OAUTH_KV.delete(key)
  const result = await api.completeAuthorization({ request: approved.request, userId, scope: saved.scope, props: { userId, oauthGeneration, authorizedAt: Date.now() }, metadata: { application: 'Business Map', email }, revokeExistingGrants: true })
  approved.headers.set('Location', result.redirectTo)
  approved.headers.set('Cache-Control', 'no-store')
  return new Response(null, { status: 303, headers: approved.headers })
}

export class OAuthBinding extends WorkerEntrypoint<OAuthEnv> {
  async ensureChatgptClient() {
    return ensureChatgptClient(createOAuthAuthorizationServer(this.env).getOAuthApi(this.env), this.env.OAUTH_KV)
  }

  async fetch(request: Request) {
    return handleOAuthRequest(request, this.env, this.ctx)
  }

  async validateAccessToken(token: string): Promise<ValidatedGrant | null> {
    const result = await createOAuthAuthorizationServer(this.env).validateToken<{ grantId?: string; oauthGeneration?: string; authorizedAt?: number }>(canonicalUrl(this.env.MCP_SERVER_URL), token, this.env)
    if (!result?.props.grantId || !result.props.oauthGeneration || typeof result.props.authorizedAt !== 'number') return null
    return { userId: result.userId, clientId: result.clientId, grantId: result.props.grantId, scopes: result.scope, resource: result.audience, expiresAt: result.expiresAt, oauthGeneration: result.props.oauthGeneration, authorizedAt: result.props.authorizedAt }
  }

  async validateToken(resource: string, token: string) {
    if (resource !== canonicalUrl(this.env.MCP_SERVER_URL)) return null
    const grant = await this.validateAccessToken(token)
    return grant ? { props: grant, audience: grant.resource, expiresAt: grant.expiresAt, scope: grant.scopes, userId: grant.userId, clientId: grant.clientId } : null
  }

  async revokeUserGrants(userId: string) {
    const api = createOAuthAuthorizationServer(this.env).getOAuthApi(this.env)
    // Re-list the first page after deleting to avoid cursors skipping deleted entries.
    for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
      const page = await api.listUserGrants(userId, { limit: 50 })
      if (!page.items.length) return
      for (const grant of page.items) await api.revokeGrant(grant.id, userId)
    }
    throw new Error('Grant revocation requires another pass')
  }
}

export async function handleOAuthRequest(request: Request, env: OAuthEnv, ctx: ExecutionContext) {
  const oauth = createOAuthAuthorizationServer(env)
  if (new URL(request.url).pathname !== '/authorize') return oauth.fetch(request, env, ctx)
  try { return await authorize(request, env, oauth.getOAuthApi(env)) }
  catch (error) {
    if (error instanceof AuthorizationError) return page('<h1>Autorização inválida</h1><p>Reinicie a conexão para continuar.</p>', undefined, 400)
    return page('<h1>Não foi possível autorizar</h1><p>Confira a solicitação e inicie uma nova conexão.</p>', undefined, 400)
  }
}

export default OAuthBinding
