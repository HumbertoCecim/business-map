import { createMcpHandler } from 'agents/mcp/server'
import { OAuthResourceServer, type OAuthResourceContext } from '@cloudflare/workers-oauth-provider'
import type { ValidatedGrant } from '../../oauth/src/index'
import { createBusinessMcpServer, type BusinessMcpDomain, type McpSession } from './server'

export type { McpSession, BusinessMcpDomain } from './server'
export { createBusinessMcpServer, MAP_RESOURCE_URI, MAP_MIME_TYPE } from './server'
export { approvedClientIds } from '../../oauth/src/policy'

export interface BusinessMcpEnv {
  AUTH: { validateAccessToken(token: string): Promise<ValidatedGrant | null> }
  BUSINESS_OBJECTS: { getByName(name: string): BusinessMcpDomain }
}

export interface BusinessMcpOptions<Env extends BusinessMcpEnv> {
  publicBaseUrl: string
  resolveSession(request: Request, env: Env, ctx: OAuthResourceContext<ValidatedGrant>): Promise<McpSession | null>
  widgetHtml(request: Request, env: Env): Promise<string>
}

export function createBusinessMcpHandler<Env extends BusinessMcpEnv>(options: BusinessMcpOptions<Env>) {
  return async (request: Request, env: Env, ctx: OAuthResourceContext<ValidatedGrant>): Promise<Response> => {
    const session = await options.resolveSession(request, env, ctx)
    if (!session) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': `Bearer resource_metadata="${options.publicBaseUrl}/.well-known/oauth-protected-resource/mcp", error="invalid_token", error_description="Reconnect your Business Map account"` } })
    const handler = createMcpHandler(() => createBusinessMcpServer({ session, domain: env.BUSINESS_OBJECTS.getByName(session.businessId), widgetHtml: () => options.widgetHtml(request, env), publicBaseUrl: options.publicBaseUrl }), {
      route: '/mcp', corsOptions: false,
      allowedHostnames: [new URL(options.publicBaseUrl).hostname],
      allowedOriginHostnames: [new URL(options.publicBaseUrl).hostname, 'chatgpt.com', 'chat.openai.com'],
      authContext: { props: { ...session } },
    })
    const response = await handler(request, env, ctx)
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-store')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}

export function createBusinessMcpResource<Env extends BusinessMcpEnv>(options: BusinessMcpOptions<Env>) {
  const base = options.publicBaseUrl.replace(/\/$/, '')
  const handler = createBusinessMcpHandler(options)
  return new OAuthResourceServer<Env, ValidatedGrant>({
    resourceMetadata: { resource: `${base}/mcp`, authorization_servers: [base], resource_name: 'Business Map Cloud' },
    // Request the whole pilot workflow at linking time. Enforcement remains per tool;
    // external clients receive only read/propose after consent policy strips approval.
    requiredScopes: ['business:read', 'business:propose', 'business:approve'],
    validateToken: (env) => async (resource, token) => {
      const grant = await env.AUTH.validateAccessToken(token)
      if (!grant || grant.resource !== resource) return null
      return { props: grant, audience: grant.resource, expiresAt: grant.expiresAt, scope: grant.scopes, userId: grant.userId, clientId: grant.clientId }
    },
    handler: { fetch: handler },
  })
}
