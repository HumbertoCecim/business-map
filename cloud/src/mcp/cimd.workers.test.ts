import { createExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOAuthAuthorizationServer, handleOAuthRequest, type OAuthEnv } from '../../oauth/src/index'
import { CHATGPT_CIMD_CLIENT_ID } from '../../oauth/src/policy'

const issuer = 'https://business.example'
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect'
const jwksUri = 'https://chatgpt.com/oauth/jwks.json'
const otherClientId = 'https://third-party.example/oauth/client.json'
const otherRedirect = 'https://third-party.example/callback'
const keyId = 'ephemeral-cimd-test-key'
const assertionType = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
const config: OAuthEnv = { OAUTH_KV: env.CACHE, OAUTH_ISSUER: issuer, MCP_SERVER_URL: `${issuer}/mcp` }
let signingKeys: CryptoKeyPair
let wrongKeys: CryptoKeyPair
let publicKey: JsonWebKey
let fetchedUrls: string[]

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

beforeAll(async () => {
  signingKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  wrongKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  publicKey = await crypto.subtle.exportKey('jwk', signingKeys.publicKey)
})

beforeEach(() => {
  fetchedUrls = []
  // Current Workers/Vitest 4 removed cloudflare:test.fetchMock. Its documented
  // replacement stubs global fetch; the installed OAuth SDK and WebCrypto remain real.
  // Only public metadata/JWKS responses are replaced. Every other network URL fails.
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    fetchedUrls.push(url)
    if (url === CHATGPT_CIMD_CLIENT_ID) return Response.json({
      client_id: CHATGPT_CIMD_CLIENT_ID,
      client_name: 'ChatGPT',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg_values_supported: ['ES256'],
      jwks_uri: jwksUri,
    })
    if (url === jwksUri) return Response.json({ keys: [{ ...publicKey, kid: keyId, alg: 'ES256', use: 'sig' }] })
    if (url === otherClientId) return Response.json({
      client_id: otherClientId,
      // A claimed name and the same scope request do not confer ChatGPT rights.
      client_name: 'ChatGPT',
      redirect_uris: [otherRedirect],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
      token_endpoint_auth_method: 'none',
    })
    throw new Error('Unexpected external request in CIMD test')
  }))
})

afterEach(() => { vi.unstubAllGlobals() })

function request(path: string, init?: RequestInit) {
  return handleOAuthRequest(new Request(`${issuer}${path}`, init), config, createExecutionContext())
}

async function authorize(clientId = CHATGPT_CIMD_CLIENT_ID, callback = redirectUri) {
  const verifier = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const userId = `cimd-user-${crypto.randomUUID()}`
  const identity = { 'x-business-user-id': userId, 'x-business-user-email': 'cimd-fixture@example.com', 'x-business-oauth-generation': 'cimd-generation' }
  const query = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: callback, scope: 'business:read business:propose business:approve', state: 'cimd-state', code_challenge: challenge, code_challenge_method: 'S256', resource: config.MCP_SERVER_URL })
  const page = await request(`/authorize?${query}`, { headers: identity })
  expect(page.status).toBe(200)
  const html = await page.text()
  const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1]
  expect(handle).toBeTruthy()
  const approved = await request('/authorize', {
    method: 'POST',
    headers: { ...identity, Origin: issuer, Cookie: page.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ handle: handle!, decision: 'approve' }),
  })
  expect(approved.status).toBe(303)
  const location = new URL(approved.headers.get('location')!)
  expect(location.origin).toBe(new URL(callback).origin)
  expect(location.searchParams.get('state')).toBe('cimd-state')
  expect(location.searchParams.get('iss')).toBe(issuer)
  return { clientId, callback, verifier, userId, code: location.searchParams.get('code')!, html }
}

async function assertion(options: { key?: CryptoKey; claims?: Record<string, unknown> } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'client-authentication+jwt' })))
  const claims = base64url(new TextEncoder().encode(JSON.stringify({ iss: CHATGPT_CIMD_CLIENT_ID, sub: CHATGPT_CIMD_CLIENT_ID, aud: issuer, iat: now, exp: now + 120, jti: crypto.randomUUID(), ...options.claims })))
  const input = `${header}.${claims}`
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, options.key ?? signingKeys.privateKey, new TextEncoder().encode(input))
  return `${input}.${base64url(new Uint8Array(signature))}`
}

function exchange(flow: Awaited<ReturnType<typeof authorize>>, jwt?: string) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: flow.clientId, redirect_uri: flow.callback, code: flow.code, code_verifier: flow.verifier, resource: config.MCP_SERVER_URL })
  if (jwt) { body.set('client_assertion_type', assertionType); body.set('client_assertion', jwt) }
  return request('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
}

describe('Automatic ChatGPT CIMD with the real OAuth provider', () => {
  it('advertises CIMD, signed client authentication and PKCE while preserving DCR fallback', async () => {
    const response = await request('/.well-known/oauth-authorization-server')
    expect(response.status).toBe(200)
    const metadata = await response.json<Record<string, unknown>>()
    expect(metadata).toMatchObject({ issuer, client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true, registration_endpoint: `${issuer}/register` })
    expect(metadata.token_endpoint_auth_methods_supported).toContain('private_key_jwt')
    expect(metadata.code_challenge_methods_supported).toContain('S256')
  })

  it('fetches the exact official metadata/JWKS, verifies ES256 and grants approval without a client secret', async () => {
    const flow = await authorize()
    expect(flow.html).toContain('<li>business:approve</li>')
    const response = await exchange(flow, await assertion())
    expect(response.status).toBe(200)
    const token = await response.json<{ access_token: string; refresh_token: string; scope: string }>()
    expect(token.scope.split(' ')).toContain('business:approve')
    expect(token.refresh_token).toBeTruthy()
    const validated = await createOAuthAuthorizationServer(config).validateToken(config.MCP_SERVER_URL, token.access_token, config)
    expect(validated).toMatchObject({ clientId: CHATGPT_CIMD_CLIENT_ID, userId: flow.userId, audience: config.MCP_SERVER_URL, props: { oauthGeneration: 'cimd-generation' } })
    expect(fetchedUrls).toContain(CHATGPT_CIMD_CLIENT_ID)
    expect(fetchedUrls).toContain(jwksUri)
    expect(fetchedUrls.every((url) => url === CHATGPT_CIMD_CLIENT_ID || url === jwksUri)).toBe(true)
  })

  it('rejects a signature made with a key outside the advertised JWKS', async () => {
    const flow = await authorize()
    const response = await exchange(flow, await assertion({ key: wrongKeys.privateKey }))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'invalid_client' })
    expect((await exchange(flow, await assertion())).status).toBe(200)
  })

  it.each([
    ['wrong audience', { aud: 'https://wrong-issuer.example' }],
    ['token endpoint audience on a typed assertion', { aud: `${issuer}/token` }],
    ['wrong subject', { sub: 'https://other-client.example/client.json' }],
    ['expired assertion', { exp: Math.floor(Date.now() / 1000) - 120 }],
  ])('rejects %s before exchanging the authorization code', async (_label, claims) => {
    const response = await exchange(await authorize(), await assertion({ claims }))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'invalid_client' })
  })

  it('rejects an assertion replay against a fresh authorization code', async () => {
    const jwt = await assertion()
    expect((await exchange(await authorize(), jwt)).status).toBe(200)
    const replay = await exchange(await authorize(), jwt)
    expect(replay.status).toBe(401)
    expect(await replay.json()).toMatchObject({ error: 'invalid_client' })
  })

  it('restricts an unrelated CIMD client claiming the ChatGPT name to read/propose', async () => {
    const flow = await authorize(otherClientId, otherRedirect)
    expect(flow.html).not.toContain('<li>business:approve</li>')
    const response = await exchange(flow)
    expect(response.status).toBe(200)
    const token = await response.json<{ scope: string }>()
    expect(token.scope.split(' ')).toEqual(['business:read', 'business:propose'])
  })

  it('keeps public DCR registration available without granting ChatGPT approval rights', async () => {
    const registered = await request('/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'ChatGPT', redirect_uris: [otherRedirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) })
    expect(registered.status).toBe(201)
    const client = await registered.json<{ client_id: string }>()
    const flow = await authorize(client.client_id, otherRedirect)
    const response = await exchange(flow)
    expect(response.status).toBe(200)
    expect((await response.json<{ scope: string }>()).scope.split(' ')).toEqual(['business:read', 'business:propose'])
    expect(fetchedUrls).toHaveLength(0)
  })
})
