/**
 * Playwright UI automation test
 * -------------------------------------------------------------------------
 * Flow under test (IGC CRM Platform / Directus admin):
 *   1. Sign in as the Sale Marketing (requester) role
 *   2. Re-open the Requirement created by create-od.spec.ts (via
 *      reports/flow-state.json — reqNo)
 *   3. Open its "Requirement All Forms" tab
 *   4. Create a Profit & Loss Statement (P&L) under it, fill mock data, save
 *   5. Save the outer Requirement record
 *   6. Hand off {plNo} (merged with the existing reqNo/odNo) to
 *      reports/flow-state.json for the rest of the approval-flow chain
 *      (salemarketing -> solution -> vp-salemarketing -> vp-solution)
 *
 * This is the P&L half of what used to be a single combined
 * requirement-od-pl.spec.ts; create-od.spec.ts is the OD half. Run
 * create-od.spec.ts first (or run the whole chain via the Playwright
 * project `dependencies` configured in playwright.config.ts) so the same
 * Requirement carries both the OD and the P&L, matching what the
 * downstream approval-flow specs expect.
 *
 * SETUP — see create-od.spec.ts.
 */

import { test, expect } from '@playwright/test';
import {
  checkpoint,
  createProfitLossStatement,
  ensureLoggedIn,
  expectNoValidationError,
  installKeepEditingHandler,
  openRequirementAllFormsTab,
  openRequirementByReqNo,
  readSubsectionItemNo,
  saveNestedItem,
  saveOuterRequirement,
  saveSession,
  subsectionContainer,
  writeReport,
  CheckpointResult,
} from './support/directus';
import { readFlowState, requireFlowState, writeFlowState } from './support/flow-state';

const SALESPERSON = process.env.DMC_SALESPERSON || 'Thitapa Sales';

test.describe('Requirements > Requirement All Forms > Profit & Loss Statement (P&L) mock data flow', () => {
  test.beforeEach(() => {
    if (!process.env.DMC_PASSWORD) {
      throw new Error(
        'Missing DMC_PASSWORD environment variable. Set it before running this test, e.g.\n' +
          '  DMC_EMAIL=pakawat@harmonyx.co DMC_PASSWORD=*** npx playwright test'
      );
    }
  });

  test('adds a P&L to the create-od.spec.ts Requirement with mock data', async ({ page }, testInfo) => {
    test.setTimeout(60_000);

    page.on('response', async (res) => {
      const isAuthLogin = res.url().includes('/auth/login');
      const isError = res.status() >= 400 && res.request().resourceType() !== 'image';
      if (isAuthLogin || isError) {
        const body = await res.text().catch(() => '<no body>');
        console.log(`\n[HTTP ${res.status()}] ${res.request().method()} ${res.url()}\n${body}\n`);
      }
    });

    await installKeepEditingHandler(page);

    const report: CheckpointResult[] = [];
    const reqNo = requireFlowState('reqNo', 'create-od.spec.ts');
    let plNo = '';

    await checkpoint(
      page,
      report,
      'Sign in',
      'A saved "salemarketing" session (see auth.setup.ts) is reused, or a fresh login succeeds; either way the app is on /admin/content, not /login.',
      async () => {
        await ensureLoggedIn(page, 'salemarketing');
      }
    );

    await checkpoint(
      page,
      report,
      `Open Requirement ${reqNo}`,
      'Re-opens the Requirement created by create-od.spec.ts and its "Requirement All Forms" tab.',
      async () => {
        await openRequirementByReqNo(page, reqNo);
        await openRequirementAllFormsTab(page);
      }
    );

    await checkpoint(
      page,
      report,
      'Create Profit & Loss Statement (P&L)',
      'The P&L form (including a Circuit ID — required at outer-save time despite the section allowing ' +
        '"No items" when the nested item itself is created) is filled with mock data and saves without a ' +
        'validation error.',
      async () => {
        // Circuit ID has a uniqueness constraint — a successful prior run
        // must not reuse its value (would collide when this new P&L tries
        // to save), but a *failed* prior run's Circuit ID is safe to retry
        // with, since it never actually got attached to a persisted P&L.
        // Persisted immediately (before the save attempt below) so a
        // failure here leaves it for the next retry instead of orphaning
        // it; cleared in the "Hand off" checkpoint once this run succeeds.
        const previous = readFlowState();
        const circuitId = previous.circuitId || `CKT-AUTO-${Date.now()}`;
        if (!previous.circuitId) writeFlowState({ circuitId });

        await createProfitLossStatement(page, {
          licenseType: '2',
          countryJob: 'Domestic',
          jobCode: 'Opex',
          capacity: '500',
          salesperson: SALESPERSON,
          circuitId,
        });
        await saveNestedItem(page); // saves P&L dialog, returns to Requirement All Forms
        await expectNoValidationError(page);
      }
    );

    await checkpoint(
      page,
      report,
      'Save Requirement and read back the P&L number',
      'The P&L is committed to the Requirement (no longer just a local pending change), and its PL-YY-NNN number can be read off the list.',
      async () => {
        await saveOuterRequirement(page, reqNo);
        const plSection = subsectionContainer(page, 'Profit Loss Statements', { last: true });
        // Positive assertion first — see create-od.spec.ts for why.
        await expect(plSection).toBeVisible({ timeout: 10_000 });
        await expect(plSection.getByText('No items')).not.toBeVisible();
        // Not anchored with ^ — see create-od.spec.ts for why.
        plNo = await readSubsectionItemNo(page, 'Profit Loss Statements', /PL-\d{2}-\d{3}/, { last: true });
        expect(plNo).toMatch(/^PL-\d{2}-\d{3}$/);
      }
    );

    await checkpoint(
      page,
      report,
      'Hand off plNo to flow-state.json',
      'reports/flow-state.json is updated so the approval-flow specs (salemarketing, solution, vp-salemarketing, vp-solution) can search by this exact P&L number.',
      async () => {
        // Clear circuitId now that it's durably attached to a committed
        // P&L — the next create-pl run must generate a fresh one rather
        // than reusing (and colliding with) this one.
        writeFlowState({ plNo, circuitId: undefined });
        // Re-save the session so salemarketing.spec.ts (next to load this
        // storageState file) inherits any refresh-token rotation that
        // happened during this run — see saveSession()'s doc comment.
        await saveSession(page, 'salemarketing');
      }
    );

    await writeReport(testInfo, report, { title: 'Create P&L (on existing Requirement) mock data flow', slug: 'create-pl' });

    const failures = report.filter((r) => r.status === 'FAIL');
    expect(
      failures,
      `${failures.length} checkpoint(s) failed:\n` +
        failures.map((f) => `- ${f.name}: ${f.error}`).join('\n')
    ).toHaveLength(0);
  });
});
