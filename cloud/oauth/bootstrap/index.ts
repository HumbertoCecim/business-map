import type { ChatgptClientCredentials } from '../src/chatgpt-client'

interface BootstrapEnv {
  AUTH: { ensureChatgptClient(): Promise<ChatgptClientCredentials> }
  BOOTSTRAP_KEY: string
}

// Local-only helper for an authenticated operator's Wrangler remote service binding.
// No deployed route, workers.dev URL or reusable bootstrap key is created.
export default {
  async fetch(request: Request, env: BootstrapEnv) {
    const url = new URL(request.url)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !env.BOOTSTRAP_KEY || request.headers.get('authorization') !== `Bearer ${env.BOOTSTRAP_KEY}`) return new Response('Not found', { status: 404 })
    if (request.method === 'GET' && url.pathname === '/health') return new Response(null, { status: 204 })
    if (request.method !== 'POST' || url.pathname !== '/bootstrap') return new Response('Not found', { status: 404 })
    try {
      return Response.json(await env.AUTH.ensureChatgptClient(), { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return new Response('Private bootstrap failed; check the deployed OAuth entrypoint.', { status: 502 })
    }
  },
} satisfies ExportedHandler<BootstrapEnv>
