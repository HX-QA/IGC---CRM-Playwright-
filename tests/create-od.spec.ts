/**
 * Playwright UI automation test
 * -------------------------------------------------------------------------
 * Flow under test (IGC CRM Platform / Directus admin):
 *   1. Sign in as the Sale Marketing (requester) role
 *   2. Content > Requirements > create a new Requirement with mock data
 *   3. Open the created Requirement > "Requirement All Forms" tab
 *   4. Create an Opportunity Decision (OD) under it, fill mock data, save
 *   5. Save the outer Requirement record
 *   6. Hand off {reqNo, odNo} to reports/flow-state.json for the rest of
 *      the approval-flow chain (create-pl -> salemarketing -> solution ->
 *      vp-salemarketing -> vp-solution)
 *
 * This is the OD half of what used to be a single combined
 * requirement-od-pl.spec.ts. create-pl.spec.ts is the P&L half — it reuses
 * the Requirement created here (via flow-state.ts) instead of creating its
 * own, so both nested items end up on the same Requirement, matching how
 * the downstream approval-flow specs expect to find them.
 *
 * SETUP
 * -------------------------------------------------------------------------
 * 1. npm i -D @playwright/test   (already installed in this project)
 * 2. npx playwright install chromium
 * 3. Provide credentials via .env.dev / .env.production (see .env.*.example)
 *    or environment variables (never hardcode secrets):
 *      DMC_EMAIL=pakawat@harmonyx.co
 *      DMC_PASSWORD=<your password>
 * 4. Run:
 *      npx playwright test tests/create-od.spec.ts --headed
 *      TEST_ENV=production npx playwright test tests/create-od.spec.ts --headed
 */

import { test, expect } from '@playwright/test';
import {
  checkpoint,
  createOpportunityDecision,
  createRequirement,
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
import { readFlowState, writeFlowState } from './support/flow-state';

// "Select Item" relational picker values (Customer Name, Salesperson, Requestor
// fields) — these must match real records in each environment (dev/production
// have different data), so they're env-driven rather than hardcoded.
const CUSTOMER_NAME = process.env.DMC_CUSTOMER_NAME || 'pakawat';
const SALESPERSON = process.env.DMC_SALESPERSON || 'Thitapa Sales';
const REQUESTOR = process.env.DMC_REQUESTOR || 'Thitapa Sales';
// Keep the default matching cleanup-mock-requirements.spec.ts's own default
// CLEANUP_PROJECT_NAME_PATTERN ("Mock Project - Network Upgrade Test") so a
// normal run stays auto-cleanable; override only for one-off named runs.
const PROJECT_NAME_PREFIX = process.env.DMC_PROJECT_NAME_PREFIX || 'Mock Project - Network Upgrade Test';

test.describe('Requirements > Requirement All Forms > Opportunity Decision (OD) mock data flow', () => {
  test.beforeEach(() => {
    if (!process.env.DMC_PASSWORD) {
      throw new Error(
        'Missing DMC_PASSWORD environment variable. Set it before running this test, e.g.\n' +
          '  DMC_EMAIL=pakawat@harmonyx.co DMC_PASSWORD=*** npx playwright test'
      );
    }
  });

  test('creates a Requirement and an OD with mock data', async ({ page }, testInfo) => {
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
    let reqNo = '';
    let odNo = '';

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
      'Create (or reuse) Requirement',
      'A new Requirement is created with mock data — unless a previous run already created one but ' +
        'failed before finishing its OD (reqNo saved, no odNo yet), in which case that Requirement is ' +
        'reopened and reused instead of creating another one. Either way its Req No. follows REQ-YY-NNN.',
      async () => {
        // Retry-without-orphaning: a prior run that got past "create the
        // Requirement" but died on the OD (form/input error) already left a
        // usable Requirement behind — reuse it rather than creating yet
        // another mock Requirement on every retry. Only create fresh when
        // there's nothing to reuse, or reuse itself fails (e.g. the saved
        // reqNo was deleted since) — that's "error at creating the
        // Requirement", which does warrant a new one.
        const previous = readFlowState();
        if (previous.reqNo && !previous.odNo) {
          try {
            await openRequirementByReqNo(page, previous.reqNo);
            reqNo = previous.reqNo;
            expect(reqNo).toMatch(/^REQ-\d{2}-\d{3}$/);
            return;
          } catch {
            // Fall through and create a new Requirement below.
          }
        }

        reqNo = await createRequirement(page, {
          customerName: CUSTOMER_NAME,
          receivedChannel: 'Email',
          // Unique per run: this is a shared dev database, and the row lookup
          // after saving matches on this exact text — a fixed name would be
          // ambiguous once earlier test runs' rows are still in the list.
          projectName: `${PROJECT_NAME_PREFIX} #${Date.now()}`,
          requirementDetail:
            'This is mock/test data for QA purposes. Customer requests a network capacity ' +
            'upgrade from 100Mbps to 500Mbps for their head office link, with target completion within 30 days.',
          salesperson: SALESPERSON,
        });
        expect(reqNo).toMatch(/^REQ-\d{2}-\d{3}$/);
        // Persist immediately (before attempting the OD below) and clear any
        // stale odNo from an older Requirement — so if the OD step fails,
        // the retry logic above reuses *this* Requirement next time instead
        // of orphaning it and creating another.
        writeFlowState({ reqNo, odNo: undefined });
      }
    );

    await checkpoint(
      page,
      report,
      'Open "Requirement All Forms" tab',
      'The tab opens and the "Opportunity Decision (OD)" section becomes visible.',
      async () => {
        await openRequirementAllFormsTab(page);
      }
    );

    await checkpoint(
      page,
      report,
      'Create Opportunity Decision (OD)',
      'The OD form is filled with mock data and saves without a validation error.',
      async () => {
        await createOpportunityDecision(page, {
          requestor: REQUESTOR,
          routeFrom: 'Bangkok Head Office',
          routeTo: 'Data Center Bangna',
          altOption: 'DMS',
          ihOption: 'MK',
          estimatedProjectTimeline: '30 days',
          budgetary: '500,000 THB',
          estimatedValue: '500000',
          remark: 'Mock/test data for QA',
          other: 'N/A',
        });
        await saveNestedItem(page); // saves OD dialog, returns to Requirement All Forms
        await expectNoValidationError(page);
      }
    );

    await checkpoint(
      page,
      report,
      'Save Requirement and read back the OD number',
      'The OD is committed to the Requirement (no longer just a local pending change), and its OD-YY-NNN number can be read off the list.',
      async () => {
        await saveOuterRequirement(page, reqNo);
        const odSection = subsectionContainer(page, 'Opportunity Decisions');
        // Positive assertion first: proves we actually landed back on the
        // Requirement All Forms tab. "No items" not being visible would
        // otherwise pass vacuously if the whole section (and page) is wrong.
        await expect(odSection).toBeVisible({ timeout: 10_000 });
        await expect(odSection.getByText('No items')).not.toBeVisible();
        // Not anchored with ^ — the listitem's aggregated text often has a
        // leading icon glyph before the OD number, which an anchored regex
        // would never match even though the number itself is right there.
        odNo = await readSubsectionItemNo(page, 'Opportunity Decisions', /OD-\d{2}-\d{3}/);
        expect(odNo).toMatch(/^OD-\d{2}-\d{3}$/);
      }
    );

    await checkpoint(
      page,
      report,
      'Hand off reqNo/odNo to flow-state.json',
      'reports/flow-state.json is written so create-pl.spec.ts (and the approval-flow specs) can pick up this exact Requirement/OD.',
      async () => {
        writeFlowState({ reqNo, odNo });
        // Directus rotates the refresh token on use — if this run's session
        // auto-refreshed at any point, re-save it so create-pl.spec.ts (which
        // loads this same storageState file fresh) inherits the current
        // token instead of the one auth.setup.ts captured before any of this
        // ran. See saveSession()'s doc comment for why this matters.
        await saveSession(page, 'salemarketing');
      }
    );

    await writeReport(testInfo, report, { title: 'Create Requirement + OD mock data flow', slug: 'create-od' });

    const failures = report.filter((r) => r.status === 'FAIL');
    expect(
      failures,
      `${failures.length} checkpoint(s) failed:\n` +
        failures.map((f) => `- ${f.name}: ${f.error}`).join('\n')
    ).toHaveLength(0);
  });
});
