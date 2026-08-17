/**
 * Playwright "setup project" — logs in once as a given role and saves the
 * authenticated session (cookies/local storage) to disk via storageState.
 * Dependent projects in playwright.config.ts point their `use.storageState`
 * at that file instead of each doing their own UI login.
 *
 * Currently only "salemarketing" needs this: create-od -> create-pl ->
 * salemarketing all run as the same Sale Marketing user back-to-back, so
 * logging in three separate times was pure waste (and, in headed mode,
 * visibly re-showed the login screen between steps that are really one
 * continuous user session). The downstream approval roles (solution,
 * vp-salemarketing, vp-solution) each appear only once, so there's nothing
 * to reuse there — they keep doing a normal fresh login in their own spec.
 *
 * See ensureLoggedIn() in support/directus.ts for the consumer side.
 */
import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { login } from './support/directus';

export const AUTH_DIR = path.resolve(__dirname, '../.auth');
export const authFile = (role: string) => path.join(AUTH_DIR, `${role}.json`);

setup('authenticate as salemarketing', async ({ page }) => {
  if (!process.env.DMC_PASSWORD) {
    throw new Error('Missing DMC_PASSWORD environment variable. Set it in .env.dev before running this test.');
  }
  await login(page, 'salemarketing');
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: authFile('salemarketing') });
});
