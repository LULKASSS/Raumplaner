// Tests: Rechenkern ohne Browser, Oberfläche mit WebKit (Safari ist das Ziel) als iPhone und als Mac-Fenster.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5191', locale: 'de-DE', timezoneId: 'Europe/Berlin' },
  projects: [
    { name: 'kern', testMatch: /kern\.spec/ },
    { name: 'iphone', testMatch: /app\.spec/, use: { ...devices['iPhone 15 Pro'] } },
    { name: 'mac', testMatch: /app\.spec/, use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 860 } } }
  ],
  webServer: { command: 'node scripts/serve.mjs', env: { PORT: '5191', HOST: '127.0.0.1' }, url: 'http://localhost:5191', reuseExistingServer: !process.env.CI }
});
