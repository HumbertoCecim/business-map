export const BUSINESS_SCOPES = ['business:read', 'business:propose', 'business:approve', 'offline_access'] as const
export const CHATGPT_CIMD_CLIENT_ID = 'https://chatgpt.com/oauth/client.json'

/** Called only after the OAuth provider has validated the client's metadata/token. */
export function isApprovedChatgptClient(clientId: string, legacyIds?: string): boolean {
  return clientId === CHATGPT_CIMD_CLIENT_ID || approvedClientIds(legacyIds).has(clientId)
}
export function approvedClientIds(value?: string): Set<string> {
  if (!value?.trim()) return new Set()
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) return new Set(parsed)
  } catch { /* Comma-separated secrets are also accepted. */ }
  return new Set(value.split(',').map((id) => id.trim()).filter(Boolean))
}

export function consentScopes(requested: string[], approved: boolean): string[] {
  return requested.filter((scope) => BUSINESS_SCOPES.includes(scope as typeof BUSINESS_SCOPES[number]) && (scope !== 'business:approve' || approved))
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function canonicalUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) throw new Error('A canonical HTTPS URL is required')
  return url.href.replace(/\/$/, '')
}
