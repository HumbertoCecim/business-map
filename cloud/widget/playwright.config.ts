import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '../e2e', testMatch: 'business-ui.spec.ts', fullyParallel: false, workers: 1,
  reporter: 'list', outputDir: './test-results',
  use: { baseURL: 'http://127.0.0.1:3091', screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: { executablePath: process.env.BUSINESS_MAP_TEST_BROWSER } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node ui-test-server.mjs', url: 'http://127.0.0.1:3091/business', reuseExistingServer: true, timeout: 60000 },
});
