/**
 * Playwright UI automation test — VP Sale Marketing role
 * -------------------------------------------------------------------------
 * Step 5 of the OD/P&L approval-flow chain (see playwright.config.ts
 * project `dependencies`): create-od -> create-pl -> salemarketing ->
 * solution -> **vp-salemarketing** -> vp-solution.
 *
 * Picks up {odNo, plNo} from reports/flow-state.json and, as the VP Sale
 * Marketing role:
 *
 *   3.1 Approve OD  — Marketing Department + PM Department approve,
 *       "ปรับปรุงราคา / Update Quotation" + final Approve, checklist
 *       confirmed, Save and Stay.
 *   3.2 Approve P&L — approves the P&L from the P&L approval inbox.
 *
 * SETUP — see create-od.spec.ts. Also requires
 * VP_SALEMARKETING_EMAIL/VP_SALEMARKETING_PASSWORD.
 */

import { test, expect } from '@playwright/test';
import { checkpoint, expectNoValidationError, inputByLabel, installKeepEditingHandler, login, openApprovalInbox, searchApprovalInbox, signOut, toggleCategoryCheckbox, writeReport, CheckpointResult } from './support/directus';
import { requireFlowState } from './support/flow-state';
import {
  BUTTON_NAME,
  CHECKBOX_NAME,
  SECTION_BUTTON_NAME,
  TEXT,
  approvalInboxLinkName,
} from './support/locators';

test.describe('VP Sale Marketing > Approve OD + Approve P&L', () => {
  test.beforeEach(() => {
    if (!process.env.VP_SALEMARKETING_PASSWORD) {
      throw new Error('Missing VP_SALEMARKETING_PASSWORD environment variable. Set it in .env.dev before running this test.');
    }
  });

  test('approves the OD and the P&L', async ({ page }, testInfo) => {
    test.setTimeout(120_000);

    await installKeepEditingHandler(page);

    const report: CheckpointResult[] = [];
    const odNo = requireFlowState('odNo', 'create-od.spec.ts');
    const plNo = requireFlowState('plNo', 'create-pl.spec.ts');

    await checkpoint(page, report, 'Sign in as VP Sale Marketing', 'Login succeeds and the app leaves /login.', async () => {
      await login(page, 'vp-salemarketing');
    });

    await checkpoint(
      page,
      report,
      `Open OD ${odNo} from the approval inbox`,
      'Searching by the saved OD number surfaces the row and opens it.',
      async () => {
        await openApprovalInbox(page, 'OD');
        await searchApprovalInbox(page, odNo);
        // Was clicking by customer name, page-wide — searchApprovalInbox
        // filters the list, but "ALT Company" (or whichever customer) is
        // never unique across a real inbox with more than one row for that
        // customer (observed: 22 matches). odNo itself is unique; use that.
        await page.getByRole('row', { name: odNo }).click();
      }
    );

    await checkpoint(
      page,
      report,
      '3.1 Approve OD — Marketing Department + PM Department',
      'Both departments\' decision steps are submitted, including the "ปรับปรุงราคา / Update Quotation" option.',
      async () => {
        await page.getByRole('button', { name: SECTION_BUTTON_NAME.APPROVAL }).click();
        // These sections are collapsed accordions (an "expand_more" icon
        // sibling, not a child, of the label text) — clicking the bare text
        // node doesn't expand them here (unlike the OD-as-nested-dialog
        // view salemarketing.spec.ts clicks through, a different
        // component/layout for the same content). Click the clickable
        // wrapper two levels up instead.
        await page.getByText(TEXT.MARKETING_DEPARTMENT, { exact: true }).locator('xpath=..').click();
        // There is no "Approve" control anywhere on this page (checked
        // every button's accessible name live) — Marketing Department is
        // pure data entry (Customer Type / Payment Terms / document
        // checklist), not a decision step. The requester's own checklist
        // submission (salemarketing.spec.ts) is what already moved this OD
        // to "Waiting for approve", but that was on a *different* view (the
        // OD nested under the Requirement) — it didn't carry over to this
        // approval-inbox view of the same OD. "Customer Business Type" here
        // is a required (starred) checkbox group (Product/Service/Rental)
        // that's still unchecked; leaving it null fails the outer save with
        // "Value can't be null". It can render disabled for longer than a
        // brief permission-check race (observed: still disabled after 15s
        // in some runs, but enabled immediately in others) — likely a
        // reactive-update lag between the requester's own checklist
        // submission (a *different* view, salemarketing.spec.ts) and this
        // approval-inbox view picking up the resulting permission change.
        // Reload and re-expand a few times rather than failing on the
        // first stale read.
        const productCheckbox = page.getByRole('checkbox', { name: CHECKBOX_NAME.MARKETING_PRODUCT_REQUIRED });
        let productEnabled = false;
        for (let attempt = 1; attempt <= 3 && !productEnabled; attempt++) {
          productEnabled = await productCheckbox
            .isEnabled({ timeout: 15000 })
            .catch(() => false);
          if (!productEnabled) {
            await page.reload();
            await page.getByRole('button', { name: SECTION_BUTTON_NAME.APPROVAL }).click();
            await page.getByText(TEXT.MARKETING_DEPARTMENT, { exact: true }).locator('xpath=..').click();
          }
        }
        await expect(productCheckbox).toBeEnabled({ timeout: 5000 });
        await productCheckbox.click();
        await page.getByText(TEXT.PM_DEPARTMENT, { exact: true }).locator('xpath=..').click();
        // PM Department has two yes/no questions ("Accepted"/"Not accepted"
        // — not "Approve") followed by a 3-way request-type choice. These
        // three positional clicks answer both questions "Accepted" and pick
        // the "ปรับปรุงราคา / Update Quotation" request type by position.
        // There's no further "Approve" button after this — confirmed live,
        // checked every button's accessible name on the page.
        await page.getByRole('button', { name: BUTTON_NAME.RADIO_UNCHECKED }).nth(4).click();
        await page.getByRole('button', { name: BUTTON_NAME.RADIO_UNCHECKED }).nth(4).click();
        await page.getByRole('button', { name: BUTTON_NAME.RADIO_UNCHECKED }).nth(5).click();
        // A trailing labeled click on this same option used to run here —
        // once nth(5) selects it, its accessible name flips to
        // "radio_button_checked ...", so re-querying for the "unchecked"
        // variant by name could never find anything. Redundant and broken;
        // removed.
        // Second required-and-empty field found the same way: "Ref. Contact
        // No." in PM Department's own "Document for Decision" sub-section
        // — but it's disabled until its neighboring "BOQ.SD Job." toggle is
        // switched on (the same enable-a-field-via-checkbox pattern the
        // P&L cost tabs use — see toggleCategoryCheckbox).
        await toggleCategoryCheckbox(page, 'BOQ.SD Job.');
        await (await inputByLabel(page, 'Ref. Contact No.')).fill('N/A');
      }
    );

    await checkpoint(
      page,
      report,
      '3.1 Approve OD — confirm checklist and Save and Stay',
      'The OD approval checklist is confirmed and the record saves without a validation error.',
      async () => {
        // How many "indeterminate_check_box" toggles are on the page here
        // varies (observed 1 and 2 across runs — one per department with an
        // outstanding document checklist item, e.g. Marketing's "Business
        // Registration Certificate" and PM's "Frame Contract"). `.all()`
        // snapshots each match's index up front via nth() — clicking one
        // can re-render and shrink the set, leaving a later nth() waiting
        // forever for an index that no longer exists. Re-query fresh each
        // time to avoid stale indices.
        const indeterminateCheckbox = page.getByRole('checkbox', { name: CHECKBOX_NAME.INDETERMINATE });
        while ((await indeterminateCheckbox.count()) > 0) {
          await indeterminateCheckbox.first().click();
        }
        // This used to click one specific "check_box Enabled" toggle right
        // after — now ambiguous (2 matches) because the loop above already
        // checked both of the same checkboxes this was trying to reach
        // (their name flips from "indeterminate_check_box Enabled" to
        // "check_box Enabled" once checked). Redundant; removed.
        await page.getByRole('button', { name: BUTTON_NAME.MORE_ACTIONS }).click();
        await page.getByText(TEXT.SAVE_AND_STAY).click();
        // Same "dispatches, doesn't wait" gap as the other specs' Save and
        // Stay — without this, the next checkpoint's navigation races a
        // still-in-flight save, which surfaces as a "Keep Editing" prompt
        // that repeatedly re-intercepts every click (unsaved changes still
        // pending underneath).
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        await expectNoValidationError(page);
      }
    );

    await checkpoint(
      page,
      report,
      `Open P&L ${plNo} from the approval inbox`,
      'Searching by the saved P&L number surfaces the row and opens it.',
      async () => {
        await page.getByRole('link', { name: approvalInboxLinkName('OD') }).click();
        await openApprovalInbox(page, 'P&L');
        await searchApprovalInbox(page, plNo);
        await page.getByRole('cell', { name: plNo }).click();
      }
    );

    await checkpoint(
      page,
      report,
      '3.2 Approve P&L',
      'The P&L Approve action is confirmed without a validation error.',
      async () => {
        await page.getByRole('button', { name: BUTTON_NAME.RADIO_UNCHECKED_APPROVE }).nth(1).click();
        await page.getByRole('button', { name: BUTTON_NAME.SAVE, exact: true }).click();
        // Same "dispatches, doesn't wait" gap fixed elsewhere in this file —
        // without settling here, Sign Out's own navigation races this save
        // and gets stuck fighting a recurring "Keep Editing" prompt
        // (observed: consistent timeout on Sign Out right after this step).
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        await expectNoValidationError(page);
      }
    );

    await checkpoint(page, report, 'Sign out', 'The account menu Sign Out link returns the app to /login.', async () => {
      await signOut(page);
    });

    await writeReport(testInfo, report, { title: 'VP Sale Marketing: Approve OD + Approve P&L', slug: 'vp-salemarketing' });

    const failures = report.filter((r) => r.status === 'FAIL');
    expect(
      failures,
      `${failures.length} checkpoint(s) failed:\n` + failures.map((f) => `- ${f.name}: ${f.error}`).join('\n')
    ).toHaveLength(0);
  });
});
