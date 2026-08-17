/**
 * Playwright UI automation test — Solution role
 * -------------------------------------------------------------------------
 * Step 4 of the OD/P&L approval-flow chain (see playwright.config.ts
 * project `dependencies`): create-od -> create-pl -> salemarketing ->
 * **solution** -> vp-salemarketing -> vp-solution.
 *
 * Picks up {plNo} from reports/flow-state.json (written by
 * create-pl.spec.ts) and, as the Solution role:
 *
 *   2. P&L — opens the P&L (Waiting for initiation) via the P&L approval
 *      inbox, fills in Solution Cost (an EP line item, a Cost line item,
 *      and a per-country cost/income detail), then "Save and Stay" twice
 *      (moves the P&L to Initiated / Waiting for approve).
 *
 * SELECTOR NOTE — see salemarketing.spec.ts: the Solution Cost fields below
 * are transcribed from an `npx playwright codegen` recording almost
 * verbatim (unlabeled numeric spinbuttons in repeating rows have no
 * accessible name to key off).
 *
 * SETUP — see create-od.spec.ts. Also requires SOLUTION_EMAIL/SOLUTION_PASSWORD.
 */

import { test, expect, Page } from '@playwright/test';
import { checkpoint, expectNoValidationError, installKeepEditingHandler, login, openApprovalInbox, searchApprovalInbox, signOut, writeReport, CheckpointResult } from './support/directus';
import { requireFlowState } from './support/flow-state';

test.describe('Solution > P&L Solution Cost (Initiated / Waiting for approve)', () => {
  test.beforeEach(() => {
    if (!process.env.SOLUTION_PASSWORD) {
      throw new Error('Missing SOLUTION_PASSWORD environment variable. Set it in .env.dev before running this test.');
    }
  });

  test('fills in P&L Solution Cost and initiates it', async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    await installKeepEditingHandler(page);

    const report: CheckpointResult[] = [];
    const plNo = requireFlowState('plNo', 'create-pl.spec.ts');

    await checkpoint(page, report, 'Sign in as Solution', 'Login succeeds and the app leaves /login.', async () => {
      await login(page, 'solution');
    });

    await checkpoint(
      page,
      report,
      `Open P&L ${plNo} from the approval inbox`,
      'Sorting descending and searching by the saved P&L number surfaces the row in "Waiting for initiation" status.',
      async () => {
        await openApprovalInbox(page, 'P&L');
        await page.locator('.align-left.actionable.sort-desc > .v-menu > .v-menu-activator > .content > .v-icon > i').click();
        await page.getByText('Sort Descending').click();
        await searchApprovalInbox(page, plNo);
        // Was clicking the first "Waiting for initiation" status cell
        // page-wide — not scoped to plNo, so it silently opened whichever
        // row happened to be first once more than one row shared that
        // status (observed: 6 matches). Scope to the row for our plNo.
        await page.getByRole('row', { name: plNo }).getByRole('cell', { name: 'Waiting for initiation' }).click();
        await page.getByRole('button', { name: 'Solution Cost' }).click();
      }
    );

    await checkpoint(
      page,
      report,
      '2. P&L — Solution Cost: add EP line item',
      'An Enterprise-Product (EP) line item ("EP automation 1") is added with USD rate/period and cost figures.',
      async () => {
        await addSolutionCostEpItem(page);
      }
    );

    await checkpoint(
      page,
      report,
      '2. P&L — Solution Cost: add Cost line item',
      'A Cost line item ("Cost automation") is added with USD rate/period and cost figures.',
      async () => {
        await addSolutionCostCostItem(page);
      }
    );

    await checkpoint(
      page,
      report,
      '2. P&L — Solution Cost: add per-country detail (Thailand)',
      'A per-country cost/income detail row for Thailand is added with code ID00AU1 and A/B breakdown values.',
      async () => {
        await addSolutionCostCountryDetail(page);
      }
    );

    await checkpoint(
      page,
      report,
      '2. P&L — Save and Stay',
      'The Solution Cost tab saves without a validation error.',
      async () => {
        // Two "indeterminate_check_box" toggles are on the page at this
        // point (initiate_flag, enabled; implement_cost_flag, disabled) —
        // same ambiguity as addSolutionCostCountryDetail above. `.first()`
        // is the enabled one (initiate_flag).
        await page.getByRole('checkbox', { name: 'indeterminate_check_box' }).first().click();
        await page.getByRole('button', { name: 'more_vert' }).click();
        await page.getByText('Save and Stay').click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        await expectNoValidationError(page);
      }
    );

    await checkpoint(
      page,
      report,
      '2. P&L — finalize checklist and Save and Stay (Initiated / Waiting for approve)',
      'The remaining checklist items are confirmed and the P&L saves again, moving it to Initiated / Waiting for approve.',
      async () => {
        await page.getByRole('checkbox', { name: 'check_box_outline_blank' }).first().click();
        await page.getByRole('checkbox', { name: 'check_box_outline_blank' }).click();
        await page.getByRole('button', { name: 'more_vert' }).click();
        await page.getByText('Save and Stay').click();
        // Same "dispatches, doesn't wait" gap as salemarketing.spec.ts's
        // Save and Stay — settle before checking for a validation error.
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        await expectNoValidationError(page);
      }
    );

    await checkpoint(page, report, 'Sign out', 'The account menu Sign Out link returns the app to /login.', async () => {
      await signOut(page);
    });

    await writeReport(testInfo, report, { title: 'Solution: P&L Solution Cost (Initiated / Waiting for approve)', slug: 'solution' });

    const failures = report.filter((r) => r.status === 'FAIL');
    expect(
      failures,
      `${failures.length} checkpoint(s) failed:\n` + failures.map((f) => `- ${f.name}: ${f.error}`).join('\n')
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Solution Cost step helpers
// ---------------------------------------------------------------------------

async function addSolutionCostEpItem(page: Page) {
  await page.getByRole('checkbox', { name: 'indeterminate_check_box' }).nth(1).click();
  await page.getByRole('button', { name: 'add', exact: true }).click();
  await page.getByRole('textbox').nth(4).click();
  await page.getByRole('textbox').nth(4).fill('EP automation 1');
  await page.getByRole('button', { name: 'radio_button_unchecked USD' }).first().click();
  await page.getByRole('spinbutton').first().click();
  await page.getByRole('spinbutton').first().fill('200');
  await page.getByRole('spinbutton').nth(1).click();
  await page.getByRole('spinbutton').first().fill('2001');
  await page.getByRole('spinbutton').nth(1).fill('2');
  await page.locator('.field.half-right > .interface > .v-menu > .v-menu-activator > .v-input > .input').click();
  await page.getByText('Month(s)').click();
  await page.getByRole('spinbutton').nth(1).click();
  await page.getByRole('spinbutton').nth(1).fill('12');
  await page.getByRole('button', { name: 'radio_button_unchecked USD' }).first().click();
  await page.getByRole('spinbutton').nth(2).click();
  await page.getByRole('spinbutton').nth(2).fill('100');
  await page.getByRole('spinbutton').nth(3).click();
  await page.getByRole('spinbutton').nth(3).fill('1');
  await page.getByRole('button', { name: 'radio_button_unchecked USD' }).click();
  await page.getByRole('spinbutton').nth(4).click();
  await page.getByRole('spinbutton').nth(4).fill('200');
  await page.locator('#dialog-outlet').getByRole('button', { name: 'check', exact: true }).click();
}

async function addSolutionCostCostItem(page: Page) {
  await page.getByRole('checkbox', { name: 'indeterminate_check_box' }).nth(1).click();
  await page.getByRole('button', { name: 'add' }).nth(2).click();
  await page.getByRole('textbox').nth(4).click();
  await page.getByRole('textbox').nth(4).fill('Cost automation');
  await page.getByRole('button', { name: 'radio_button_unchecked USD' }).first().click();
  await page.getByRole('spinbutton').first().click();
  await page.getByRole('spinbutton').first().fill('200');
  await page.getByRole('spinbutton').nth(1).click();
  await page.getByRole('spinbutton').nth(1).fill('4');
  await page.locator('.field.half-right > .interface > .v-menu > .v-menu-activator > .v-input > .input').click();
  await page.locator('#menu-outlet div').filter({ hasText: /^Month\(s\)$/ }).click();
  await page.getByRole('button', { name: 'radio_button_unchecked USD' }).first().click();
  await page.getByRole('spinbutton').nth(2).click();
  await page.getByRole('spinbutton').nth(2).fill('200');
  await page.getByRole('spinbutton').nth(3).click();
  await page.getByRole('spinbutton').nth(3).fill('2');
  await page.getByRole('button', { name: 'radio_button_unchecked USD' }).click();
  await page.getByRole('spinbutton').nth(4).click();
  await page.getByRole('spinbutton').nth(4).fill('1');
  await page.getByRole('spinbutton').nth(3).dblclick();
  await page.getByRole('spinbutton').nth(3).fill('1');
  await page.getByRole('spinbutton').nth(4).click();
  await page.getByRole('spinbutton').nth(4).fill('1000');
  await page.locator('#dialog-outlet').getByRole('button', { name: 'check', exact: true }).click();
}

async function addSolutionCostCountryDetail(page: Page) {
  // Two "indeterminate_check_box" toggles live in this tab panel
  // (off_net_cost_flag, implement_cost_flag) — the second is disabled, so
  // an unscoped click is ambiguous. Only the first (enabled) one is ours.
  await page.locator('#tabpanel-solution_cost_tab').getByRole('checkbox', { name: 'indeterminate_check_box' }).first().click();
  await page.getByRole('button', { name: 'add' }).nth(3).click();

  await page.locator('.field.half.first-visible-field > .interface > .many-to-one > .v-input > .input').click();
  await page.locator('div').filter({ hasText: /^Thailand$/ }).nth(1).click();
  await page.getByRole('button', { name: 'check', exact: true }).nth(2).click();

  await page.locator('.field.half-right > .interface > .many-to-one > .v-input > .input').click();
  await page.locator('.v-table.table > table > tbody > .table-row > .spacer').click();
  await page.getByRole('button', { name: 'check', exact: true }).nth(2).click();

  await page.getByRole('textbox').nth(4).click();
  await page.getByRole('textbox').nth(4).fill('12');
  await page.getByRole('textbox').nth(5).click();
  await page.getByRole('textbox').nth(5).fill('ID00AU1');
  await page.locator('div:nth-child(5) > .interface > .v-input > .input > input').click();
  await page.locator('div:nth-child(5) > .interface > .v-input > .input > input').fill('A');
  await page.locator('div:nth-child(6) > .interface > .v-input > .input > input').click();
  await page.locator('div:nth-child(6) > .interface > .v-input > .input > input').fill('B');
  await page.locator('#dialog-outlet').getByRole('button', { name: 'check', exact: true }).click();
}
