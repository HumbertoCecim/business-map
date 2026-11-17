/**
 * Cloudflare Worker entry (wrangler `main`). Wraps the framework's default
 * server entry so every deployed response goes through cross-cutting steps:
 *   1. validate required env once per isolate (fail fast on misconfig),
 *   2. add baseline security headers, and
 *   3. report unhandled exceptions to Sentry (when SENTRY_DSN is set).
 *
 * Importing `@tanstack/react-start/server-entry` reuses the exact handler the
 * framework would otherwise run, so SSR/streaming behaviour is unchanged.
 */
import * as Sentry from '@sentry/cloudflare'
import entry from '@tanstack/react-start/server-entry'
import { withSecurityHeaders } from '@/lib/security-headers'
import { assertEnvOnce } from '@/lib/env-validate'
import { createDb } from '@/db/client'
import { runCleanup } from '@/features/maintenance/cleanup'
import { businessApi, mcpRoute, oauthRoute, siteIdentity, type PilotBindings } from '@/features/pilot/http'
export { BusinessObject } from '@/business/object'

const fetchHandler = (
  entry as { fetch: (request: Request, env: Cloudflare.Env, ctx: ExecutionContext) => Promise<Response> }
).fetch

const handler = {
  async fetch(request: Request, rawEnv: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    const env = rawEnv as PilotBindings
    await assertEnvOnce()
    const url = new URL(request.url)
    // Protocol endpoints carry their own headers and must never be wrapped as HTML.
    if (url.pathname === '/mcp' || url.pathname.startsWith('/.well-known/oauth-protected-resource')) return mcpRoute(request, env, ctx)
    if (['/authorize', '/token', '/register', '/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'].includes(url.pathname)) return oauthRoute(request, env)
    if (url.pathname === '/health') return Response.json({ service: 'business-map-cloud', status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
    if (url.pathname === '/api/pilot/status' && request.method === 'GET') return Response.json({ signupAvailable: !!env.RESEND_API_KEY && !!env.EMAIL_FROM }, { headers: { 'Cache-Control': 'no-store' } })
    if (url.pathname.startsWith('/api/business')) return businessApi(request, env)
    // The upstream starter includes billing/admin/demo routes; they are not part of this pilot.
    if (/^\/(?:api\/auth\/admin|api\/webhooks|api\/billing|api\/sponsor|admin|docs|zh|pricing|sponsor|waitlist)(?:\/|$)/.test(url.pathname)) return new Response('Not found', { status: 404 })
    if (url.pathname === '/') return Response.redirect(new URL('/business', env.PUBLIC_APP_URL), 302)
    if (url.pathname === '/business' && !await siteIdentity(request, env)) return Response.redirect(new URL('/login', env.PUBLIC_APP_URL), 303)
    const response = await fetchHandler(request, env, ctx)
    return withSecurityHeaders(response)
  },

  // Cron Triggers entry (schedule in wrangler.jsonc → triggers.crons). Runs the
  // maintenance cleanup; extend with your own periodic tasks (digests, etc.).
  async scheduled(_controller: ScheduledController, env: Cloudflare.Env, _ctx: ExecutionContext): Promise<void> {
    const result = await runCleanup(createDb(env.DB), Date.now())
    console.log('[cron] cleanup', result)
  },
}

// withSentry catches unhandled exceptions / promise rejections in the worker.
// Returning undefined when no DSN is set disables Sentry entirely (degrades
// gracefully). tracesSampleRate: 0 keeps it errors-only — cheap by default.
export default Sentry.withSentry(
  (env: Cloudflare.Env) =>
    env.SENTRY_DSN ? { dsn: env.SENTRY_DSN, tracesSampleRate: 0, sendDefaultPii: false } : undefined,
  handler,
)
