import { defineConfig } from '@playwright/test'

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  retries: 0,
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: 1,
})
