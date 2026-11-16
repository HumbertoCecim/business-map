/** The redirect URI must come from the provider's validated consent description. */
export function consentPage(content: string, headers = new Headers(), status = 200, validatedRedirectUri?: string) {
  const redirectOrigin = validatedRedirectUri ? new URL(validatedRedirectUri).origin : ''
  // URL.origin excludes paths, queries and fragments; never interpolate raw client input into CSP.
  if (redirectOrigin && !/^https?:\/\//.test(redirectOrigin)) throw new Error('Unsupported consent redirect origin')
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  // no-referrer changes a native form POST's Origin to null. Preserve same-origin
  // submissions while withholding the consent URL from the external callback.
  headers.set('Referrer-Policy', 'same-origin')
  headers.set('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${redirectOrigin ? ` ${redirectOrigin}` : ''}; frame-ancestors 'none'; base-uri 'none'`)
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorizar · GrowYourPlan</title><style>body{font:16px system-ui;background:#f4f3ef;color:#14281f;margin:0;padding:32px}main{max-width:580px;margin:6vh auto;background:white;padding:32px;border-radius:18px}h1{font-size:27px}p,li{line-height:1.6}code{overflow-wrap:anywhere}button{font:inherit;padding:12px 18px;border:1px solid #c5ccc7;border-radius:10px;background:white;cursor:pointer;margin:8px 8px 0 0}button[value=approve]{background:#145b45;color:white}small{color:#52655a}</style><main>${content}</main></html>`, { status, headers })
}
