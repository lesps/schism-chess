import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

// Always use the dev server for e2e — the invasion test needs the ?sfen= loader
// which is only active in DEV mode (import.meta.env.DEV = true).
const serverUrl = 'http://localhost:5173';

// In the managed remote dev environment, Chromium is pre-installed at a known path.
// In CI (GitHub Actions), Playwright installs its own browser; omit executablePath.
const launchOptions = isCI
  ? {}
  : {
      executablePath: '/opt/pw-browsers/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  timeout: 30000,
  use: {
    baseURL: serverUrl,
    viewport: { width: 390, height: 844 },
    browserName: 'chromium',
    launchOptions,
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: serverUrl,
    reuseExistingServer: !isCI,
    timeout: 120000,
  },
  reporter: 'list',
});
