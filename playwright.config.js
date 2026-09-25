import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './dev',
  testMatch: '**/e2e.spec.{ts,js}',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  use: {
    baseURL: 'http://localhost:3000',
    navigationTimeout: 90_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    env: {
      DATABASE_ADAPTER: process.env.DATABASE_ADAPTER ?? 'sqlite',
      PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? 'e2e-secret',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    url: 'http://localhost:3000/admin',
  },
})
