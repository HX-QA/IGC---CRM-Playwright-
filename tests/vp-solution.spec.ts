/**
 * Playwright UI automation test — VP Solution role
 * -------------------------------------------------------------------------
 * Step 6 (final) of the OD/P&L approval-flow chain (see
 * playwright.config.ts project `dependencies`): create-od -> create-pl ->
 * salemarketing -> solution -> vp-salemarketing -> **vp-solution**.
 *
 * Picks up {plNo} from reports/flow-state.json and, as the VP Solution
 * role:
 *
 *   3.1 Approve P&L — approves the P&L from the P&L approval inbox.
 *
 * SETUP — see create-od.spec.ts. Also requires
 * VP_SOLUTION_EMAIL/VP_SOLUTION_PASSWORD.
 */

import { test, expect } from '@playwright/test';
import { checkpoint, installKeepEditingHandler, login, openApprovalInbox, searchApprovalInbox, signOut, writeReport, CheckpointResult } from './support/directus';
import { requireFlowState } from './support/flow-state';

test.describe('VP Solution > Approve P&L', () => {
  test.beforeEach(() => {
    if (!process.env.VP_SOLUTION_PASSWORD) {
      throw new Error('Missing VP_SOLUTION_PASSWORD environment variable. Set it in .env.dev before running this test.');
    }
  });

  test('approves the P&L', async ({ page }, testInfo) => {
    test.setTimeout(60_000);

    await installKeepEditingHandler(page);

    const report: CheckpointResult[] = [];
    const plNo = requireFlowState('plNo', 'create-pl.spec.ts');

    await checkpoint(page, report, 'Sign in as VP Solution', 'Login succeeds and the app leaves /login.', async () => {
      await login(page, 'vp-solution');
    });

    await checkpoint(
      page,
      report,
      `Open P&L ${plNo} from the approval inbox`,
      'Searching by the saved P&L number surfaces the row and opens it.',
      async () => {
        await openApprovalInbox(page, 'P&L');
        await searchApprovalInbox(page, plNo);
        // Was clicking the first "--" (empty-field placeholder) cell
        // page-wide — not scoped to plNo, so it's ambiguous the moment more
        // than one row has an empty field in that column (observed: 29
        // matches). Scope to the row for our plNo instead.
        await page.getByRole('row', { name: plNo }).click();
      }
    );

    await checkpoint(
      page,
      report,
      '3.1 Approve P&L',
      'The P&L Approve action is confirmed without a validation error and the row shows "Waiting for approve".',
      async () => {
        await page.getByRole('button', { name: 'radio_button_unchecked Approve' }).click();
        await page.getByRole('button', { name: 'check', exact: true }).click();
        await page.locator('div').filter({ hasText: /^Waiting for approve$/ }).click();
      }
    );

    await checkpoint(page, report, 'Sign out', 'The account menu Sign Out link returns the app to /login.', async () => {
      await page.getByRole('link', { name: 'order_approve P&L' }).click();
      await signOut(page);
    });

    await writeReport(testInfo, report, { title: 'VP Solution: Approve P&L', slug: 'vp-solution' });

    const failures = report.filter((r) => r.status === 'FAIL');
    expect(
      failures,
      `${failures.length} checkpoint(s) failed:\n` + failures.map((f) => `- ${f.name}: ${f.error}`).join('\n')
    ).toHaveLength(0);
  });
});
