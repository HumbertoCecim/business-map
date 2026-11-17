/** Pilot admission is server-controlled, independent of model/tool arguments. */
export function normalizeEmail(value: string) { return value.trim().toLowerCase() }
export function isInvitedEmail(email: string, invitations?: string, admins?: string) {
  const invited = `${invitations || ''},${admins || ''}`.split(/[\s,;]+/).filter(Boolean).map(normalizeEmail)
  return invited.includes(normalizeEmail(email))
}

export function safeReturnTo(value: string | null, fallback = '/business') {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback
}
