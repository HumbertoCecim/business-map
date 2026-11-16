import { describe, expect, it } from 'vitest'
import { approvedClientIds, canonicalUrl, consentScopes, escapeHtml } from '../../oauth/src/policy'

describe('OAuth pilot policy', () => {
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
