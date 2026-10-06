import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5199',
    launchOptions: { executablePath },
  },
  webServer: [
    {
      command: 'npx vite --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: true,
    },
    {
      // the built site, for checks that only hold in production (the Content Security Policy)
      command: 'npx vite build --logLevel warn && npx vite preview --port 5198 --strictPort',
      url: 'http://localhost:5198',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
