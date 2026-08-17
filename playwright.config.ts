import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Load environment variables from a .env file (KEY=VALUE per line, #
 * comments ignored) into process.env, without adding a dotenv dependency.
 *
 * Which file gets loaded depends on TEST_ENV:
 *   TEST_ENV unset/"dev"  -> .env.dev          (dev credentials/URL)
 *   TEST_ENV=production   -> .env.production   (production credentials/URL)
 */
const envFile = `.env.${process.env.TEST_ENV || 'dev'}`;
const envPath = path.resolve(__dirname, envFile);
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  // open: 'always' launches the HTML report in a browser as soon as the run
  // finishes (default is 'on-failure' only). Skipped on CI (no browser there).
  reporter: [['html', { open: process.env.CI ? 'never' : 'always' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    // example.spec.ts (the default Playwright starter test) — kept isolated
    // to its own testMatch so it still runs cross-browser without being
    // caught up in the OD/P&L approval-flow chain below.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /example\.spec\.ts/,
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /example\.spec\.ts/,
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /example\.spec\.ts/,
    },

    // Logs in once as "salemarketing" and saves the session to .auth/ — see
    // tests/auth.setup.ts. create-od/create-pl/salemarketing below all run
    // as this same user back-to-back, so they load this storageState
    // instead of each doing their own fresh UI login.
    {
      name: 'auth-salemarketing',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /auth\.setup\.ts/,
    },

    // OD/P&L approval-flow chain. Each stage acts on the Requirement/OD/P&L
    // created (and numbered) by the previous one, handed off via
    // reports/flow-state.json (see tests/support/flow-state.ts) — so they
    // must run in this order regardless of worker count. Playwright's
    // project `dependencies` guarantees that: running any one of them (e.g.
    // `--project=vp-solution`) automatically runs its dependencies first.
    {
      name: 'create-od',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/salemarketing.json' },
      testMatch: /create-od\.spec\.ts/,
      dependencies: ['auth-salemarketing'],
    },
    {
      name: 'create-pl',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/salemarketing.json' },
      testMatch: /create-pl\.spec\.ts/,
      dependencies: ['create-od'],
    },
    {
      // Anchored (not just /salemarketing\.spec\.ts/) so this doesn't also
      // pick up vp-salemarketing.spec.ts as a substring match.
      name: 'salemarketing',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/salemarketing.json' },
      testMatch: /(^|\/)salemarketing\.spec\.ts$/,
      dependencies: ['create-pl'],
    },
    {
      // Anchored so this doesn't also pick up vp-solution.spec.ts.
      name: 'solution',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(^|\/)solution\.spec\.ts$/,
      dependencies: ['salemarketing'],
    },
    {
      name: 'vp-salemarketing',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /vp-salemarketing\.spec\.ts/,
      dependencies: ['solution'],
    },
    {
      name: 'vp-solution',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /vp-solution\.spec\.ts/,
      dependencies: ['vp-salemarketing'],
    },

    // Maintenance utility — deliberately standalone (no `dependencies`, not
    // depended on by anything else) so it's never pulled in by running any
    // of the projects above. Dry-run by default regardless of how it's
    // invoked — see cleanup-mock-requirements.spec.ts for the CONFIRM_CLEANUP
    // opt-in required to actually delete anything.
    {
      name: 'cleanup',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /cleanup-mock-requirements\.spec\.ts/,
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
