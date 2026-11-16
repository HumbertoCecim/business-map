import { defineConfig } from 'vitest/config'
import { cloudflarePool, cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { fileURLToPath } from 'node:url'

const options = {
  main: fileURLToPath(new URL('./src/business/tests/worker.ts', import.meta.url)),
  miniflare: {
    compatibilityDate: '2026-05-30',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: { BUSINESS_OBJECTS: { className: 'BusinessObject', useSQLite: true } },
    r2Buckets: ['SKILL_PACKAGES'],
    bindings: { APPROVAL_SECRET: 'business-integration-test-secret-at-least-32-characters' },
  },
}
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'business-node', environment: 'node', include: ['src/business/tests/**/*.node.test.ts'] } },
      {
        plugins: [cloudflareTest(options)],
        test: {
          name: 'business-workers', include: ['src/business/tests/**/*.workers.test.ts'],
          pool: cloudflarePool(options),
        },
      },
    ],
  },
})
