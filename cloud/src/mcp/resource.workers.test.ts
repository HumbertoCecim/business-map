import { createExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createBusinessMcpResource, type BusinessMcpDomain, type BusinessMcpEnv } from './index'
import type { ValidatedGrant } from '../../oauth/src/index'
import { newBoard } from '../business/domain'
import type { Actor } from '../business/model'

const base = 'https://business.example'
const grant: ValidatedGrant = { userId: 'owner-a', clientId: 'client-a', grantId: 'grant-a', scopes: ['business:read'], resource: `${base}/mcp`, expiresAt: Math.floor(Date.now() / 1000) + 900, oauthGeneration: 'generation-a', authorizedAt: Date.now() }

function fixture(validation: ValidatedGrant | null) {
  let sessionResolutions = 0
  const env: BusinessMcpEnv = {
    AUTH: { async validateAccessToken(token) { return token === 'valid-test-token' ? validation : null } },
    BUSINESS_OBJECTS: { getByName() { throw new Error('A rejected request must not reach a business') } },
  }
  const resource = createBusinessMcpResource({
    publicBaseUrl: base,
    async resolveSession() { sessionResolutions++; return null },
    async widgetHtml() { return '<!doctype html><title>Business Map</title>' },
  })
  return { env, resource, resolutions: () => sessionResolutions }
}

describe('OAuth protected MCP resource', () => {
  it('publishes resource metadata and an OAuth challenge without exposing business data', async () => {
    const { env, resource, resolutions } = fixture(null)
    const discovery = await resource.fetch(new Request(`${base}/.well-known/oauth-protected-resource/mcp`), env, createExecutionContext())
    expect(discovery.status).toBe(200)
    expect(await discovery.json()).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['business:read', 'business:propose', 'business:approve'] })
    const denied = await resource.fetch(new Request(`${base}/mcp`, { method: 'POST' }), env, createExecutionContext())
    expect(denied.status).toBe(401)
    expect(denied.headers.get('www-authenticate')).toContain('resource_metadata=')
    expect(resolutions()).toBe(0)
  })

  it.each([
    ['invalid token', null],
    ['wrong audience', { ...grant, resource: 'https://other.example/mcp' }],
    ['expired token', { ...grant, expiresAt: Math.floor(Date.now() / 1000) - 1 }],
  ])('rejects %s before resolving a business', async (_name, validation) => {
    const { env, resource, resolutions } = fixture(validation as ValidatedGrant | null)
    const response = await resource.fetch(new Request(`${base}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer valid-test-token' } }), env, createExecutionContext())
    expect(response.status).toBe(401)
    expect(resolutions()).toBe(0)
  })

  it('requires the current SaaS session association even when the OAuth token is valid', async () => {
    const { env, resource, resolutions } = fixture(grant)
    const response = await resource.fetch(new Request(`${base}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer valid-test-token' } }), env, createExecutionContext())
    expect(response.status).toBe(401)
    expect(resolutions()).toBe(1)
  })

  it('serves authenticated stateless HTTP calls through the real SDK client transport', async () => {
    const actors: Actor[] = []
    const board = newBoard('business-a', 'Mapa HTTP canônico')
    const domain = {
      async getSnapshot(actor: Actor) { actors.push(actor); return { businessId: 'business-a', fingerprint: 'fingerprint', board, proposals: [], audit: [], lastTransactionId: null } },
    } as unknown as BusinessMcpDomain
    const bindings: BusinessMcpEnv = {
      AUTH: { async validateAccessToken(token) { return token === 'valid-test-token' ? grant : null } },
      BUSINESS_OBJECTS: { getByName(name) { expect(name).toBe('business-a'); return domain } },
    }
    const resource = createBusinessMcpResource({
      publicBaseUrl: base,
      async resolveSession(_request, _env, ctx) { return { userId: ctx.props.userId, businessId: 'business-a', clientId: ctx.props.clientId, grantId: ctx.props.grantId, scopes: ctx.props.scopes, trustedChatgpt: false } },
      async widgetHtml() { return '<!doctype html><title>Business Map</title>' },
    })
    const client = new Client({ name: 'remote-transport-test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      authProvider: { async token() { return 'valid-test-token' } },
      fetch: async (input, init) => {
        const incoming = new Request(input, init)
        incoming.headers.set('Host', new URL(incoming.url).host)
        return resource.fetch(incoming, bindings, createExecutionContext())
      },
    })
    try {
      await client.connect(transport)
      expect((await client.listTools()).tools.some((tool) => tool.name === 'business_show_map')).toBe(true)
      const response = await client.callTool({ name: 'business_get_context', arguments: {} })
      expect(response.structuredContent).toMatchObject({ ok: true, businessId: 'business-a', board: { title: 'Mapa HTTP canônico' } })
      expect(actors).toEqual([{ userId: 'owner-a', businessId: 'business-a', channel: 'external', clientId: 'client-a', grantId: 'grant-a' }])
    } finally { await client.close() }
  })
})

// Compile the binding contract as a public interface without importing a concrete Durable Object.
type DomainBinding = BusinessMcpEnv['BUSINESS_OBJECTS']['getByName'] extends (name: string) => BusinessMcpDomain ? true : false
const bindingIsDomain: DomainBinding = true
void bindingIsDomain
