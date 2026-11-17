import { describe, expect, it } from 'vitest'
import { approvedClientIds, canonicalUrl, CHATGPT_CIMD_CLIENT_ID, consentScopes, escapeHtml, isApprovedChatgptClient } from '../../oauth/src/policy'

describe('OAuth pilot policy', () => {
  it('automatically approves only the exact stable ChatGPT CIMD identifier and explicit legacy clients', () => {
    expect(isApprovedChatgptClient(CHATGPT_CIMD_CLIENT_ID)).toBe(true)
    expect(isApprovedChatgptClient('legacy-fixed-client', '["legacy-fixed-client"]')).toBe(true)
    for (const id of [
      'ChatGPT', 'https://chatgpt.com/oauth/client.json/',
      'https://chatgpt.com/oauth/client.json?host=chatgpt',
      'https://chatgpt.com/oauth/client.json#official',
      'https://chatgpt.com.evil.example/oauth/client.json',
      'https://chat.openai.com/oauth/client.json',
      'http://chatgpt.com/oauth/client.json',
    ]) expect(isApprovedChatgptClient(id)).toBe(false)
    expect(approvedClientIds().has(CHATGPT_CIMD_CLIENT_ID)).toBe(false)
  })

  it('uses exact operator-approved IDs and never client names for approval rights', () => {
    expect(approvedClientIds('["pilot-client"]').has('pilot-client')).toBe(true)
    expect(approvedClientIds('pilot-client,other-client').has('ChatGPT')).toBe(false)
    expect(consentScopes(['business:read', 'business:propose', 'business:approve', 'offline_access', 'admin'], false)).toEqual(['business:read', 'business:propose', 'offline_access'])
    expect(consentScopes(['business:approve'], true)).toEqual(['business:approve'])
  })
  it('escapes every client-provided consent field and requires canonical HTTPS endpoints', () => {
    expect(escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;')
    expect(canonicalUrl('https://business.example/')).toBe('https://business.example')
    for (const url of ['http://business.example', 'https://a:b@business.example', 'https://business.example?token=x']) expect(() => canonicalUrl(url)).toThrow()
  })
})
