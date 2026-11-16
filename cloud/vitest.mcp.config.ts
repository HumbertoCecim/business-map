import { defineConfig } from 'vitest/config'
import { cloudflarePool, cloudflareTest } from '@cloudflare/vitest-pool-workers'

const workerOptions = {
  miniflare: {
    compatibilityDate: '2026-07-02',
    compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
    kvNamespaces: ['CACHE'],
  },
}

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'mcp-node', environment: 'node', include: ['src/mcp/**/*.node.test.ts'] } },
      {
        plugins: [cloudflareTest(workerOptions)],
        test: { name: 'mcp-workers', include: ['src/mcp/**/*.workers.test.ts'], pool: cloudflarePool(workerOptions) },
      },
    ],
  },
})
