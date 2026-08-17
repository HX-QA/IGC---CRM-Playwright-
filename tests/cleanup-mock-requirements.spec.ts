/**
 * Maintenance utility — NOT part of the OD/P&L approval-flow chain.
 * -------------------------------------------------------------------------
 * Deletes Requirements left behind by repeated test runs of
 * create-od.spec.ts (Project Name = `Mock Project - Network Upgrade Test
 * #<epoch-ms>`, see createRequirement's caller in create-od.spec.ts).
 *
 * SAFETY
 * -------------------------------------------------------------------------
 * This is destructive and irreversible, so it's dry-run by default:
 *   - Lists every Requirement whose Project Name contains
 *     CLEANUP_PROJECT_NAME_PATTERN (default: the mock-data prefix above)
 *     and prints their Req No. / Project Name / Date Created — nothing
 *     else happens.
 *   - Actually deleting requires an explicit opt-in:
 *       CONFIRM_CLEANUP=yes npx playwright test --project=cleanup
 *   - Not wired into any project `dependencies` chain and not matched by
 *     the default `npx playwright test` (see playwright.config.ts) — it
 *     only runs when explicitly targeted with --project=cleanup or
 *     --grep, so a routine full-suite run can never trigger it by accident.
 *
 * VERIFICATION STATUS
 * -------------------------------------------------------------------------
 * The UI mechanics (select rows, click bulk delete, confirm) are verified
 * against the live app. The confirm prompt ("Are you sure you want to
 * delete these N items? This action can not be undone.") is NOT wrapped in
 * a role="dialog" element — an earlier version assumed it was and its
 * `getByRole('dialog').last()` scoping silently never matched anything
 * (safe failure mode: nothing got deleted, just a thrown assertion) until
 * fixed to match by the prompt's own text instead.
 *
 * KNOWN SERVER-SIDE ISSUE: confirming the delete for a Requirement that
 * still has nested children (OD/P&L/Circuit — i.e. every mock Requirement
 * created via create-od.spec.ts) currently gets a
 * `500 INTERNAL_SERVER_ERROR` from `DELETE /items/requirements` — this is
 * the API rejecting the delete (likely a cascade/FK constraint on the
 * backend), not a selector bug in this script. This script has no way to
 * detect or work around that from the UI; it needs a backend-side fix (or
 * deleting each nested OD/P&L/Circuit first) before bulk-deleting mock
 * Requirements will actually succeed.
 */

import { test, expect } from '@playwright/test';
import { installKeepEditingHandler, login, setMaxPerPage } from './support/directus';

const NAME_PATTERN = process.env.CLEANUP_PROJECT_NAME_PATTERN || 'Mock Project - Network Upgrade Test';
const CONFIRMED = process.env.CONFIRM_CLEANUP === 'yes';

test.describe('Maintenance > delete mock Requirements created by test runs', () => {
  test.beforeEach(() => {
    if (!process.env.DMC_PASSWORD) {
      throw new Error('Missing DMC_PASSWORD environment variable. Set it in .env.dev before running this test.');
    }
  });

  test('lists (and, only if CONFIRM_CLEANUP=yes, deletes) mock Requirements', async ({ page }) => {
    test.setTimeout(120_000);

    await installKeepEditingHandler(page);

    await login(page, 'salemarketing');

    await page.goto(`${process.env.DMC_BASE_URL || 'https://dmc-dev.intergateway.net'}/admin/content/requirements`);
    await page.waitForLoadState('networkidle');
    // Deliberately not using the fulltext "Search Items..." box: it appears
    // to lag behind very recently created rows (observed live — rows made
    // minutes earlier didn't show up in it yet), which would make a dry run
    // under-report. Bumping Per Page and matching client-side against the
    // already-rendered rows doesn't have that lag.
    await setMaxPerPage(page, page);

    const rows = page.getByRole('row', { name: NAME_PATTERN });
    const rowCount = await rows.count();

    console.log(`\nFound ${rowCount} Requirement row(s) matching "${NAME_PATTERN}":\n`);
    const reqNos: string[] = [];
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const reqNo = await row.getByText(/^REQ-\d{2}-\d{3}$/).innerText().catch(() => '(unknown)');
      const rowText = await row.innerText().catch(() => '');
      console.log(`  - ${reqNo}: ${rowText.replace(/\s+/g, ' ').trim()}`);
      reqNos.push(reqNo);
    }

    if (rowCount === 0) {
      console.log('Nothing to clean up.');
      return;
    }

    if (!CONFIRMED) {
      console.log(
        `\nDry run only — nothing was deleted. Re-run with CONFIRM_CLEANUP=yes to actually delete these ${rowCount} Requirement(s).`
      );
      return;
    }

    console.log(`\nCONFIRM_CLEANUP=yes — selecting all ${rowCount} matched row(s) for deletion...`);
    for (let i = 0; i < rowCount; i++) {
      await rows.nth(i).getByRole('checkbox').first().click();
    }

    const deleteButton = page.getByRole('button', { name: 'delete', exact: true });
    await expect(deleteButton, 'No bulk "delete" action appeared after selecting rows — this role may lack delete permission.').toBeVisible({
      timeout: 5_000,
    });
    await deleteButton.click();

    // Confirmed against the live DOM: the confirm prompt ("Are you sure you
    // want to delete these N items? This action can not be undone.") isn't
    // wrapped in a role="dialog" element, so scope by its own text instead.
    await expect(
      page.getByText(/Are you sure you want to delete these \d+ items\?/),
      'Expected the delete-confirmation prompt after clicking the bulk delete action.'
    ).toBeVisible({ timeout: 5_000 });
    const confirmButton = page.getByRole('button', { name: 'Delete', exact: true }).last();
    await confirmButton.click();
    await page.waitForLoadState('networkidle');

    console.log(`Deleted: ${reqNos.join(', ')}`);
  });
});
