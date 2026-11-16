import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

// Official stable ChatGPT redirect when RFC 9207 issuer identification is advertised.
// https://developers.openai.com/plugins/build/auth#redirect-url
export const CHATGPT_REDIRECT_URI = 'https://chatgpt.com/connector_platform_oauth_redirect'
const POINTER_KEY = 'operator:chatgpt-client:v1'

export type ChatgptClientCredentials = {
  created: boolean
  clientId: string
  clientSecret?: string
  redirectUris: string[]
  tokenEndpointAuthMethod: string
}

/** Operator-only, through the private service binding. Never expose this as a public route. */
export async function ensureChatgptClient(api: OAuthHelpers, kv: KVNamespace): Promise<ChatgptClientCredentials> {
  const pointer = await kv.get(POINTER_KEY)
  if (pointer) {
    const existing = await api.lookupClient(pointer)
    if (!existing || existing.tokenEndpointAuthMethod === 'none' || existing.redirectUris.length !== 1 || existing.redirectUris[0] !== CHATGPT_REDIRECT_URI) throw new Error('The seeded ChatGPT client requires operator repair')
    return { created: false, clientId: existing.clientId, redirectUris: existing.redirectUris, tokenEndpointAuthMethod: existing.tokenEndpointAuthMethod }
  }
  const client = await api.createClient({
    clientName: 'Business Map Cloud · ChatGPT piloto',
    clientUri: 'https://chatgpt.com',
    redirectUris: [CHATGPT_REDIRECT_URI],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    // The package's default is confidential client_secret_basic. Leaving the method
    // implicit preserves its supported Basic/Post secret compatibility; 'none' is refused.
  })
  if (!client.clientSecret) throw new Error('The seeded client must be confidential')
  // API-created client records have no registration TTL. Store only the public ID;
  // the provider stores the secret hash and returns plaintext only on creation.
  await kv.put(POINTER_KEY, client.clientId)
  return { created: true, clientId: client.clientId, clientSecret: client.clientSecret, redirectUris: client.redirectUris, tokenEndpointAuthMethod: client.tokenEndpointAuthMethod }
}
