import { defineConfig } from 'vitest/config'
import { cloudflarePool, cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

const reactRoot = realpathSync(fileURLToPath(new URL('./node_modules/@tanstack/react-start', import.meta.url)))
const serverRoot = realpathSync(resolve(reactRoot, '../react-start-server'))
// BetterAuth's cookie bridge only imports setCookie. Point to the real implementation,
// avoiding the unused renderer's build-time virtual route entries in this API-only harness.
const requestResponse = resolve(serverRoot, '../start-server-core/dist/esm/request-response.js')

const migrations = await readD1Migrations(fileURLToPath(new URL('./drizzle', import.meta.url)))
const options = {
  main: fileURLToPath(new URL('./src/features/pilot/tests/worker.ts', import.meta.url)),
  miniflare: {
    compatibilityDate: '2026-05-30', compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
    durableObjects: { BUSINESS_OBJECTS: { className: 'BusinessObject', useSQLite: true } },
    d1Databases: ['DB'], r2Buckets: ['SKILL_PACKAGES'], kvNamespaces: ['OAUTH_KV'],
    bindings: {
      TEST_MIGRATIONS: migrations,
      BETTER_AUTH_SECRET: 'pilot-boundary-test-secret-with-at-least-32-characters',
      BETTER_AUTH_URL: 'https://pilot.example.test', PUBLIC_APP_URL: 'https://pilot.example.test',
      APPROVAL_SECRET: 'pilot-approval-test-secret-with-at-least-32-characters',
      OAUTH_ISSUER: 'https://pilot.example.test', MCP_SERVER_URL: 'https://pilot.example.test/mcp',
      PILOT_INVITE_EMAILS: 'bootstrap@example.test,revoked-bootstrap@example.test,expired-bootstrap@example.test',
      ADMIN_EMAILS: 'admin@example.test', PILOT_REQUIRE_EMAIL_VERIFICATION: 'true',
      RESEND_API_KEY: '', EMAIL_FROM: 'Pilot <pilot@example.test>',
    },
  },
}
export default defineConfig({
  plugins: [cloudflareTest(options)],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@tanstack/react-start/server': requestResponse } },
  test: { name: 'pilot-workers', include: ['src/features/pilot/**/*.workers.test.ts'], pool: cloudflarePool(options), testTimeout: 20_000 },
})
