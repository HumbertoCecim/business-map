import { createExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createOAuthAuthorizationServer, handleOAuthRequest, type OAuthEnv } from '../../oauth/src/index'
import { CHATGPT_REDIRECT_URI, ensureChatgptClient } from '../../oauth/src/chatgpt-client'

const issuer = 'https://business.example'
const config: OAuthEnv = { OAUTH_KV: env.CACHE, OAUTH_ISSUER: issuer, MCP_SERVER_URL: `${issuer}/mcp` }

async function request(path: string, init?: RequestInit) {
  return handleOAuthRequest(new Request(`${issuer}${path}`, init), config, createExecutionContext())
}

async function begin(scope = 'business:read business:propose business:approve') {
  const register = await request('/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: '<script>Fake ChatGPT</script>', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) })
  expect(register.status).toBe(201)
  const client = await register.json<{ client_id: string }>()
  const verifier = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  const userId = `user-${crypto.randomUUID()}`
  const query = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://client.example/callback', scope, state: 'opaque-client-state', code_challenge: challenge, code_challenge_method: 'S256', resource: config.MCP_SERVER_URL })
  const response = await request(`/authorize?${query}`, { headers: { 'x-business-user-id': userId, 'x-business-user-email': 'owner@example.com', 'x-business-oauth-generation': 'generation-a' } })
  expect(response.status).toBe(200)
  const html = await response.text()
  expect(html).not.toContain('<script>Fake')
  const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1]
  expect(handle).toBeTruthy()
  return { clientId: client.client_id, verifier, userId, handle: handle!, cookie: response.headers.get('set-cookie')!.split(';')[0], html }
}

function consent(flow: Awaited<ReturnType<typeof begin>>, decision = 'approve', overrides: Record<string, string> = {}) {
  return request('/authorize', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: issuer, Cookie: flow.cookie, 'x-business-user-id': flow.userId, 'x-business-oauth-generation': 'generation-a', ...overrides }, body: new URLSearchParams({ handle: flow.handle, decision }) })
}

describe('Private OAuth authorization worker', () => {
  it('seeds one non-expiring confidential ChatGPT client and requires its secret for Basic/Post token exchange', async () => {
    const seeded = await ensureChatgptClient(createOAuthAuthorizationServer(config).getOAuthApi(config), config.OAUTH_KV)
    expect(seeded.created).toBe(true)
    expect(seeded.clientSecret).toBeTruthy()
    expect(seeded.redirectUris).toEqual([CHATGPT_REDIRECT_URI])
    const repeat = await ensureChatgptClient(createOAuthAuthorizationServer(config).getOAuthApi(config), config.OAUTH_KV)
    expect(repeat).toMatchObject({ created: false, clientId: seeded.clientId })
    expect(repeat.clientSecret).toBeUndefined()
    const stored = await config.OAUTH_KV.get(`client:${seeded.clientId}`)
    expect(stored).not.toContain(seeded.clientSecret!)
    expect((await config.OAUTH_KV.list({ prefix: `client:${seeded.clientId}` })).keys[0].expiration).toBeUndefined()
    const approvedConfig = { ...config, APPROVED_CHATGPT_CLIENT_IDS: JSON.stringify([seeded.clientId]) }
    const api = createOAuthAuthorizationServer(approvedConfig).getOAuthApi(approvedConfig)
    for (const method of ['client_secret_basic', 'client_secret_post']) {
      const verifier = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
      const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
      const query = new URLSearchParams({ response_type: 'code', client_id: seeded.clientId, redirect_uri: CHATGPT_REDIRECT_URI, scope: 'business:read business:propose business:approve', state: 'fixed-client-state', code_challenge: challenge, code_challenge_method: 'S256', resource: config.MCP_SERVER_URL })
      const parsed = await api.parseAuthRequest(new Request(`${issuer}/authorize?${query}`))
      const authorization = await api.completeAuthorization({ request: parsed, userId: 'fixed-client-user', scope: parsed.scope, metadata: {}, props: { oauthGeneration: 'generation-fixed', authorizedAt: Date.now() } })
      const code = new URL(authorization.redirectTo).searchParams.get('code')!
      const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: seeded.clientId, code, code_verifier: verifier, redirect_uri: CHATGPT_REDIRECT_URI, resource: config.MCP_SERVER_URL })
      const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })
      const withoutSecret = await handleOAuthRequest(new Request(`${issuer}/token`, { method: 'POST', headers, body }), approvedConfig, createExecutionContext())
      expect(withoutSecret.status).toBe(401)
      if (method === 'client_secret_basic') {
        body.delete('client_id')
        headers.set('Authorization', `Basic ${btoa(`${seeded.clientId}:${seeded.clientSecret}`)}`)
      }
      else body.set('client_secret', seeded.clientSecret!)
      const exchanged = await handleOAuthRequest(new Request(`${issuer}/token`, { method: 'POST', headers, body }), approvedConfig, createExecutionContext())
      expect(exchanged.status).toBe(200)
      const token = await exchanged.json<{ access_token: string; scope: string }>()
      expect(token.scope.split(' ')).toContain('business:approve')
      expect(await createOAuthAuthorizationServer(approvedConfig).validateToken(config.MCP_SERVER_URL, token.access_token, approvedConfig)).toMatchObject({ clientId: seeded.clientId, userId: 'fixed-client-user' })
    }
    expect((await request('/bootstrap', { method: 'POST' })).status).toBe(404)
  })

  it('completes DCR, browser-bound consent, PKCE exchange and audience-bound token validation', async () => {
    const flow = await begin()
    expect(flow.html).toContain('cliente pode consultar e propor')
    expect(flow.html).not.toContain('<li>business:approve</li>')
    const approved = await consent(flow)
    expect(approved.status).toBe(303)
    const callback = new URL(approved.headers.get('location')!)
    expect(callback.origin).toBe('https://client.example')
    expect(callback.searchParams.get('state')).toBe('opaque-client-state')
    expect(callback.searchParams.get('iss')).toBe(issuer)
    const exchange = await request('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: flow.clientId, code: callback.searchParams.get('code')!, code_verifier: flow.verifier, redirect_uri: 'https://client.example/callback', resource: config.MCP_SERVER_URL }) })
    expect(exchange.status).toBe(200)
    const token = await exchange.json<{ access_token: string; refresh_token: string; scope: string }>()
    expect(token.refresh_token).toBeTruthy()
    expect(token.scope).not.toContain('business:approve')
    const validated = await createOAuthAuthorizationServer(config).validateToken(config.MCP_SERVER_URL, token.access_token, config)
    expect(validated).toMatchObject({ userId: flow.userId, clientId: flow.clientId, audience: config.MCP_SERVER_URL, props: { userId: flow.userId, clientId: flow.clientId } })
    expect(validated?.props.grantId).toBeTruthy()
    expect(validated?.props.oauthGeneration).toBe('generation-a')
    expect(validated?.props.authorizedAt).toBeTypeOf('number')
    const refresh = await request('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: flow.clientId, refresh_token: token.refresh_token, resource: config.MCP_SERVER_URL }) })
    expect(refresh.status).toBe(200)
    const refreshed = await refresh.json<{ access_token: string }>()
    const renewed = await createOAuthAuthorizationServer(config).validateToken(config.MCP_SERVER_URL, refreshed.access_token, config)
    expect(renewed?.props.oauthGeneration).toBe('generation-a')
    expect(renewed?.props.authorizedAt).toBe(validated?.props.authorizedAt)
    expect(await createOAuthAuthorizationServer(config).validateToken(config.MCP_SERVER_URL, 'forged', config)).toBeNull()
    await createOAuthAuthorizationServer(config).getOAuthApi(config).revokeGrant(renewed!.props.grantId, flow.userId)
    expect(await createOAuthAuthorizationServer(config).validateToken(config.MCP_SERVER_URL, refreshed.access_token, config)).toBeNull()
    expect((await consent(flow)).status).toBe(403)
  })

  it('rejects account switching, missing binding cookies and cross-origin consent; preserves deny state', async () => {
    const flow = await begin()
    expect((await consent(flow, 'approve', { 'x-business-user-id': 'different-owner' })).status).toBe(403)
    expect((await consent(flow, 'approve', { 'x-business-oauth-generation': 'generation-b' })).status).toBe(403)
    expect((await consent(flow, 'approve', { Cookie: '' })).status).toBe(400)
    expect((await consent(flow, 'approve', { Origin: 'https://evil.example' })).status).toBe(403)
    const denied = await consent(flow, 'deny')
    expect(denied.status).toBe(303)
    const callback = new URL(denied.headers.get('location')!)
    expect(callback.searchParams.get('error')).toBe('access_denied')
    expect(callback.searchParams.get('state')).toBe('opaque-client-state')
    expect(callback.searchParams.get('iss')).toBe(issuer)
  })

  it('requires an authenticated SaaS identity at the private authorization entry point', async () => {
    expect((await request('/authorize')).status).toBe(401)
  })
})
