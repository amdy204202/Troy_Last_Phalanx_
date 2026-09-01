import { defineConfig } from '@playwright/test';

// The same-process runner owns NO_OPEN: '1'; config has no webServer and no reuseExistingServer: false lifecycle.

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  projects: [
    { name: 'v15-frozen', testMatch: /v15-frozen-suite\.spec\.mjs/, expect: { timeout: 10_000 }, use: { baseURL: 'http://127.0.0.1:4175' } },
    { name: 'v16-live', testMatch: /(?:v15-v16-upgrade|v16-rich-journey|v16-rich-offline|v16-rich-responsive|v16-rich-defense-state)\.spec\.mjs/, use: { baseURL: 'http://127.0.0.1:4173' } },
  ],
});
