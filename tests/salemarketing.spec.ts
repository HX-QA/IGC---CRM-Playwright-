/**
 * Playwright UI automation test — Sale Marketing role
 * -------------------------------------------------------------------------
 * Step 3 of the OD/P&L approval-flow chain (see playwright.config.ts
 * project `dependencies`): create-od -> create-pl -> **salemarketing** ->
 * solution -> vp-salemarketing -> vp-solution.
 *
 * Picks up {reqNo, odNo, plNo} from reports/flow-state.json (written by
 * create-od.spec.ts / create-pl.spec.ts) and, as the Sale Marketing
 * (requester) role:
 *
 *   1.1 OD  — submits the Marketing Department's "Product" checklist item
 *             on the OD's Approval tab (moves the OD to "Waiting for approve")
 *   1.2 P&L — fills in BW Type / project code / period date / Common Cost /
 *             Sale Cost / Additional cost & income, then "Save and Stay"
 *             (moves the P&L to "Waiting for initiation")
 *
 * SELECTOR NOTE
 * -------------------------------------------------------------------------
 * fillPLCommonCost is transcribed from an `npx playwright codegen`
 * recording almost verbatim — its inputs are unlabeled numeric
 * "spinbutton" steppers inside repeating cost-table rows with no
 * accessible name to key off, so they're addressed positionally, same as
 * codegen itself would. If it breaks, re-record it by inspecting the live
 * DOM (`npx playwright test --debug`).
 *
 * fillPLSaleCost / fillPLIncome / fillPLAdditionalCostAndIncome were
 * *re-recorded* against the live app (its "Sale Cost"/"Income"/"Additional"
 * tabs turned out to be structured differently than the original codegen
 * dump implied — "Income" line items live on their own "Income" tab, not
 * inside "Sale Cost") and use label-scoped lookups (fieldByLabel /
 * inputByLabel / selectDropdownOption / selectRadioByLabel) instead of
 * page-wide positional indices, since Directus keeps every tab's fields
 * mounted (just hidden) — a raw `getByRole('spinbutton').nth(N)` silently
 * drifts depending on which other tabs/panels happen to be expanded.
 * (inputByLabel / selectDropdownOption / selectRadioByLabel /
 * toggleCategoryCheckbox — see tests/support/directus.ts.)
 *
 * SETUP — see create-od.spec.ts. Also requires DMC_EMAIL/DMC_PASSWORD (the
 * same Sale Marketing account used to create the Requirement/OD/P&L).
 */

import { test, expect, Page } from '@playwright/test';
import {
  checkpoint,
  ensureLoggedIn,
  expectNoValidationError,
  inputByLabel,
  installKeepEditingHandler,
  openRequirementAllFormsTab,
  openRequirementByReqNo,
  selectDropdownOption,
  selectRadioByLabel,
  signOut,
  toggleCategoryCheckbox,
  writeReport,
  CheckpointResult,
} from './support/directus';
import { requireFlowState } from './support/flow-state';
import {
  BUTTON_NAME,
  BW_TYPE_DROPDOWN_TRIGGER,
  CHECKBOX_NAME,
  COMMON_COST_FIELD,
  DATE_RANGE_PICKER,
  SECTION_BUTTON_NAME,
  SELECTOR,
  TEXT,
  creatingItemIn,
  datePickerCell,
} from './support/locators';

test.describe('Sale Marketing > OD waiting-for-approve + P&L input detail', () => {
  test.beforeEach(() => {
    if (!process.env.DMC_PASSWORD) {
      throw new Error('Missing DMC_PASSWORD environment variable. Set it in .env.dev before running this test.');
    }
  });

  test('submits OD product checklist and fills P&L cost detail', async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    await installKeepEditingHandler(page);

    const report: CheckpointResult[] = [];
    const reqNo = requireFlowState('reqNo', 'create-od.spec.ts');
    const odNo = requireFlowState('odNo', 'create-od.spec.ts');
    const plNo = requireFlowState('plNo', 'create-pl.spec.ts');

    await checkpoint(
      page,
      report,
      'Sign in as Sale Marketing',
      'A saved "salemarketing" session (see auth.setup.ts) is reused, or a fresh login succeeds; either way the app is on /admin/content, not /login.',
      async () => {
        await ensureLoggedIn(page, 'salemarketing');
      }
    );

    await checkpoint(
      page,
      report,
      `Open Requirement ${reqNo} > OD ${odNo}`,
      'The Requirement All Forms tab opens and the OD child item (matched by its saved OD number) opens.',
      async () => {
        await openRequirementByReqNo(page, reqNo);
        await openRequirementAllFormsTab(page);
        await page.getByRole('listitem').filter({ hasText: odNo }).click();
      }
    );

    await checkpoint(
      page,
      report,
      '1.1 OD — submit Marketing Department "Product" checklist item',
      'The OD Approval tab accepts the Marketing Department checklist and the item is confirmed (OD moves to Waiting for approve).',
      async () => {
        await page.getByRole('button', { name: SECTION_BUTTON_NAME.APPROVAL }).click();
        await page.getByText(TEXT.MARKETING_DEPARTMENT).click();
        await page.getByRole('checkbox', { name: CHECKBOX_NAME.MARKETING_PRODUCT_REQUIRED }).click();
        await page.locator(SELECTOR.DIALOG_OUTLET).getByRole('button', { name: BUTTON_NAME.SAVE, exact: true }).click();
        // That "check" only confirms a small approval sub-dialog — the OD
        // itself is still open as its own right-side slide-in drawer on top
        // of the Requirement's "All Forms" page, and was never explicitly
        // closed here. Opening the P&L drawer next while this one is still
        // up stacks the two, and OD's still-present content can intercept
        // clicks meant for the P&L drawer sitting behind/beside it
        // (observed: a "container right" element swallowing the
        // period-date input's click a step later). Tried closing it via its
        // own "close" button (unreliable — the checklist confirmation
        // re-renders OD's header right after, repeatedly detaching that
        // button) and via Escape (this app doesn't bind Escape to it
        // either). Same fix as saveOuterRequirement() uses for a related
        // problem: don't try to dismiss whatever's currently open —
        // re-navigate fresh, which guarantees a clean single-drawer state
        // regardless of what was left open.
        await page.waitForTimeout(1500);
        await openRequirementByReqNo(page, reqNo);
        await openRequirementAllFormsTab(page);
      }
    );

    await checkpoint(
      page,
      report,
      `Open P&L ${plNo}`,
      'The P&L child item (matched by its saved P&L number) opens in Draft status.',
      async () => {
        await page.getByRole('listitem').filter({ hasText: plNo }).click();
      }
    );

    await checkpoint(
      page,
      report,
      '1.2 P&L — set BW Type and period date',
      'BW Type 2 is selected and the period date range is set. (Not "...and project code" — no such field exists on this P&L; see setPLBwType\'s doc comment for what that used to actually do.)',
      async () => {
        await setPLBwType(page, 'BW Type 2');
        await pickPLPeriodDateRange(page, { endDate: '2027-08-31', startDate: '2026-07-01' });
      }
    );

    await checkpoint(
      page,
      report,
      '1.2 P&L — Common Cost',
      'The Common Cost tab is filled in with mock cost figures for each line item.',
      async () => {
        await fillPLCommonCost(page);
      }
    );

    await checkpoint(
      page,
      report,
      '1.2 P&L — Sale Cost',
      'The Sale Cost tab\'s "Marketing Assistance" cost category is expanded and filled in (OTC/MRC/ARC currency + amount).',
      async () => {
        await fillPLSaleCost(page);
      }
    );

    await checkpoint(
      page,
      report,
      '1.2 P&L — Income',
      'The Income tab gets two line items (Income001 automation, Income automation 3) with a 7% tax rate on the second.',
      async () => {
        await fillPLIncome(page);
      }
    );

    await checkpoint(
      page,
      report,
      '1.2 P&L — Additional cost & income',
      'The Additional tab gets one Additional Cost item (ADD COST Automation) and one Additional Income item (Add Income).',
      async () => {
        await fillPLAdditionalCostAndIncome(page);
      }
    );

    await checkpoint(
      page,
      report,
      '1.2 P&L — Save and Stay (Waiting for initiation)',
      'The P&L dialog and outer panel save without a validation error; the P&L moves to Waiting for initiation.',
      async () => {
        await page.getByRole('checkbox', { name: CHECKBOX_NAME.INDETERMINATE }).click();
        await page.locator(SELECTOR.DIALOG_OUTLET).getByRole('button', { name: BUTTON_NAME.SAVE }).click();
        await page.getByRole('button', { name: BUTTON_NAME.MORE_ACTIONS }).click();
        await page.getByText(TEXT.SAVE_AND_STAY).click();
        // "Save and Stay" only *dispatches* the save — without waiting for
        // it to actually settle, the next checkpoint (Sign out) can race a
        // still-in-flight save. Observed effect: the P&L silently stayed in
        // Draft (never reached Waiting for initiation) and Sign out's
        // account-menu click got stuck re-triggering "Keep Editing" forever
        // because there were still-pending unsaved changes underneath.
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        // Unlike create-od/create-pl's saves, this checkpoint never actually
        // checked for a validation error — a silently-rejected save looks
        // identical to a successful one (no thrown exception either way),
        // which would explain the P&L staying in Draft.
        await expectNoValidationError(page);
      }
    );

    await checkpoint(page, report, 'Sign out', 'The account menu Sign Out link returns the app to /login.', async () => {
      await signOut(page);
    });

    await writeReport(testInfo, report, {
      title: 'Sale Marketing: OD waiting-for-approve + P&L input detail',
      slug: 'salemarketing',
    });

    const failures = report.filter((r) => r.status === 'FAIL');
    expect(
      failures,
      `${failures.length} checkpoint(s) failed:\n` + failures.map((f) => `- ${f.name}: ${f.error}`).join('\n')
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// P&L step helpers (Information / Common Cost / Sale Cost / Additional)
// ---------------------------------------------------------------------------

/**
 * "Project Code" doesn't exist as a field anywhere on this P&L — checked
 * both the Information tab and the BW-Type-2-specific Common Cost rows
 * exhaustively. What used to run after the BW Type selection here
 * (`.layout-list > .actions > .v-button > .button` then
 * `.field.full > .interface > .v-input > .input > input`) was never really
 * a "confirm + fill project code" pair: that first click lands on Circuits'
 * *own* "Create New" button (coincidentally the same class chain), and the
 * fill types straight into the "Circuit ID" field that click just opened
 * — confirmed live via screenshot, value and all ("ID-HX-AUT001", the
 * hardcoded "project code" literal, showing up *inside* a "Creating Item
 * in Circuit ID" dialog).
 *
 * That alone would just be a mislabeled circuit — except the ID it typed
 * is a **fixed literal**, reused by every run of this spec (this file
 * doesn't vary it like create-pl.spec.ts's own circuitId does). With
 * "Value has to be unique" on that field, and this same literal saved
 * successfully by however many runs came before today, colliding with
 * historical duplicates was inevitable — which is exactly the
 * "circuit_id: Value has to be unique" failure that kept surfacing at the
 * later "Save and Stay" step (this dialog is opened+filled but never
 * explicitly saved here; the pending nested change gets swept in and
 * committed by that later save instead, which is why the error showed up
 * there and not here).
 *
 * create-pl.spec.ts already creates this P&L's one required Circuit (with
 * a real per-run-unique ID) the moment the P&L itself is created — by the
 * time this spec runs, a Circuit already exists. So the fix isn't "make
 * this ID unique too" — it's that this step never needed to touch Circuits
 * at all. Just select BW Type.
 */
async function setPLBwType(page: Page, bwType: string) {
  // Custom "v-menu" widget, not the standard dropdown selectDropdownOption
  // expects (its options don't render into the shared #menu-outlet portal).
  await page.locator(BW_TYPE_DROPDOWN_TRIGGER).click();
  await page.getByText(bwType).click();
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * This is a DUAL-PANE range calendar (e.g. "Aug 2026" / "Sep 2026" shown
 * side by side, each with its own month/year toggle) — an unscoped
 * `getByRole('button', { name: /-Open months overlay$/ })` matches both
 * panes' toggles at once, which throws on `.innerText()`. Track the first
 * (left) pane only; "Previous month"/"Next month" are single buttons (not
 * pane-duplicated) and always keep both panes adjacent, so stepping them
 * from the left pane's reading is enough to reach either end.
 *
 * Also tracks the *year*, not just the month: it used to assume same-year
 * (the year was fixed via a separate year-overlay click right before this
 * ran) — but the calendar opens on today's actual month/year, not any
 * pre-filled default (observed: it opened already on "today", not
 * "today + 1 year" as this flow's End Date assumed), so End Date can be a
 * full year or more away and needs to cross that boundary too.
 */
async function navigateCalendarToMonth(page: Page, targetDate: string /* 'YYYY-MM-DD' */) {
  const targetMonthIndex = Number(targetDate.slice(5, 7)) - 1;
  const targetYear = Number(targetDate.slice(0, 4));
  const monthToggle = page.getByRole('button', { name: DATE_RANGE_PICKER.MONTH_OVERLAY_TOGGLE }).first();
  const yearToggle = page.getByRole('button', { name: DATE_RANGE_PICKER.YEAR_OVERLAY_TOGGLE }).first();
  for (let i = 0; i < 36; i++) {
    const monthLabel = (await monthToggle.innerText()).trim();
    const yearLabel = (await yearToggle.innerText()).trim();
    const currentMonthIndex = MONTH_ABBR.indexOf(monthLabel);
    const currentYear = Number(yearLabel);
    if (currentMonthIndex === targetMonthIndex && currentYear === targetYear) return;
    const goBack = currentYear * 12 + currentMonthIndex > targetYear * 12 + targetMonthIndex;
    await page.getByRole('button', { name: goBack ? BUTTON_NAME.PREVIOUS_MONTH : BUTTON_NAME.NEXT_MONTH }).click({ timeout: 5_000 });
  }
  throw new Error(`Could not navigate the calendar to ${targetDate}.`);
}

/**
 * "Period Date" range picker: opens the calendar, navigates to and picks
 * `endDate`, then navigates to and picks `startDate`. Directus's custom
 * datepicker encodes each day cell as `[data-test-id="dp-YYYY-MM-DD"]` —
 * but only for whichever month is currently on screen (see
 * navigateCalendarToMonth) — never assume either date is already visible.
 */
async function pickPLPeriodDateRange(page: Page, data: { endDate: string; startDate: string }) {
  await page.locator(SELECTOR.DATE_PICKER_INPUT).click();
  await navigateCalendarToMonth(page, data.endDate);
  const endDay = data.endDate.slice(-2).replace(/^0/, '');
  // `[data-test-id="dp-YYYY-MM-DD"]` can match twice: the real cell in its
  // own month's pane, plus a grayed-out "offset" cell showing that same
  // date at the leading/trailing edge of the *adjacent* pane's grid (to
  // fill out its week rows). `.first()` is the real (non-offset) cell.
  await page.locator(datePickerCell(data.endDate)).getByText(endDay, { exact: true }).first().click({ timeout: 10_000 });
  await navigateCalendarToMonth(page, data.startDate);
  const startDay = data.startDate.slice(-2).replace(/^0/, '');
  await page.locator(datePickerCell(data.startDate)).getByText(startDay, { exact: true }).first().click({ timeout: 10_000 });
}

/** Common Cost tab: a fixed set of line-item rows (BW Type 2's standard cost breakdown), each with 1-2 numeric fields. */
async function fillPLCommonCost(page: Page) {
  await page.getByRole('button', { name: SECTION_BUTTON_NAME.COMMON_COST }).click();

  await page.getByRole('spinbutton').first().click();
  await page.getByRole('spinbutton').first().fill('11');
  await page.getByRole('spinbutton').nth(1).click();
  await page.getByRole('spinbutton').first().click();
  await page.getByRole('spinbutton').first().fill('1');
  await page.getByRole('spinbutton').nth(1).click();
  await page.getByRole('spinbutton').nth(1).fill('1');
  await page.getByRole('spinbutton').nth(3).click();
  await page.getByRole('spinbutton').nth(3).fill('1');
  await page.getByRole('spinbutton').nth(4).click();
  await page.getByRole('spinbutton').nth(4).fill('1');

  await page.locator(COMMON_COST_FIELD.ROW4_FIRST_VISIBLE_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW4_FIRST_VISIBLE_INPUT).fill('1');
  await page.locator(COMMON_COST_FIELD.ROW4_COL3_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW4_COL3_INPUT).fill('1');
  await page.locator(COMMON_COST_FIELD.ROW5_FIRST_VISIBLE_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW5_FIRST_VISIBLE_INPUT).fill('1');
  await page.locator(COMMON_COST_FIELD.ROW5_COL3_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW5_FIRST_VISIBLE_INPUT).fill('11');
  await page.locator(COMMON_COST_FIELD.ROW5_FIRST_VISIBLE_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW5_FIRST_VISIBLE_INPUT).fill('1');
  await page.locator(COMMON_COST_FIELD.ROW5_COL3_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW5_COL3_INPUT).fill('1');
  await page.locator(COMMON_COST_FIELD.ROW6_COL3_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW5_COL3_INPUT).fill('11');
  await page.locator(COMMON_COST_FIELD.ROW5_COL3_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW5_COL3_INPUT).fill('1');
  await page.locator(COMMON_COST_FIELD.ROW5_FULL_WIDTH_TOGGLE).click();
  await page.locator(COMMON_COST_FIELD.ROW6_COL3_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW6_COL3_INPUT).fill('1');

  await page.locator(COMMON_COST_FIELD.FIXED_RATE_INPUT).first().click();
  await page.locator(COMMON_COST_FIELD.FIXED_RATE_INPUT).first().fill('1');
  await page.getByText('Fixed Rate (USD)0.03').click();

  await page.locator(COMMON_COST_FIELD.ROW7_COL3_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW7_COL3_INPUT).fill('1');
  await page.locator(COMMON_COST_FIELD.ROW8_COL2_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW8_COL2_INPUT).fill('1');
  await page.locator(COMMON_COST_FIELD.ROW8_COL3_INPUT).click();
  await page.locator(COMMON_COST_FIELD.ROW8_COL3_INPUT).fill('1');
}

/**
 * Sale Cost tab: expands the "Marketing Assistance" cost category (one of
 * four fixed toggles: Use USO Fee Cost / Marketing Assistance / Implement
 * Cost (PM) / Selling Expense) and fills its OTC/MRC/ARC charge-detail
 * fields. Re-recorded against the live app — verified via
 * chrome-devtools-axi that this panel's fields share the exact same
 * label set as the Additional Cost item dialog (see
 * fillPLAdditionalCostAndIncome).
 */
async function fillPLSaleCost(page: Page) {
  await page.getByRole('button', { name: SECTION_BUTTON_NAME.SALE_COST }).click();

  // "Marketing Assistance"'s own Enabled checkbox — toggling it is what
  // reveals its OTC/MRC/ARC detail fields below.
  await toggleCategoryCheckbox(page, 'Marketing Assistance');

  await selectRadioByLabel(page, 'OTC/NRC Currency', 'USD');
  await (await inputByLabel(page, 'OTC/NRC Amount')).fill('100');
  await (await inputByLabel(page, 'MRC Duration')).fill('12');
  await selectDropdownOption(page, 'MRC Duration Type', 'Month(s)');
  await selectRadioByLabel(page, 'MRC Currency', 'USD');
  await (await inputByLabel(page, 'MRC Amount')).fill('100');
  await (await inputByLabel(page, 'ARC Duration (Year)')).fill('1');
  await selectRadioByLabel(page, 'ARC Currency', 'USD');
  await (await inputByLabel(page, 'ARC Amount')).fill('10');
}

type IncomeItem = {
  name: string;
  duration: string;
  durationType: string; // e.g. 'Month(s)'
  price: string;
  vat?: string; // e.g. '7%' — left at the default (0%) when omitted
  usoFee: 'Yes' | 'No';
};

/**
 * Income tab: a dedicated "Incomes" list (separate from Sale Cost — the
 * original codegen recording never explicitly switched to this tab, but
 * its "Income001 automation"/"Income automation 3" line items only exist
 * here). Two items, added and saved one at a time via "add".
 */
async function fillPLIncome(page: Page) {
  await page.getByRole('button', { name: SECTION_BUTTON_NAME.INCOME }).click();

  await addIncomeItem(page, { name: 'Income001 automation', duration: '12', durationType: 'Month(s)', price: '100000', usoFee: 'No' });
  await addIncomeItem(page, { name: 'Income automation 3', duration: '2', durationType: 'Month(s)', price: '3000', vat: '7%', usoFee: 'Yes' });
}

async function addIncomeItem(page: Page, data: IncomeItem) {
  await page.getByRole('button', { name: BUTTON_NAME.ADD, exact: true }).first().click();
  await expect(page.getByText(creatingItemIn('Incomes'))).toBeVisible();

  await (await inputByLabel(page, 'Income Detail')).fill(data.name);
  await selectRadioByLabel(page, 'Currency', 'USD');
  await (await inputByLabel(page, 'Duration')).fill(data.duration);
  await selectDropdownOption(page, 'Duration Type', data.durationType);
  await (await inputByLabel(page, 'Price')).fill(data.price);
  if (data.vat) await selectDropdownOption(page, 'VAT (%)', data.vat);
  await selectRadioByLabel(page, 'Uso Fee', data.usoFee);

  await page.getByRole('button', { name: BUTTON_NAME.SAVE, exact: true }).last().click();
}

type AdditionalCostItem = {
  name: string;
  otcAmount: string;
  mrcDuration: string;
  mrcDurationType: string; // e.g. 'Month(s)'
  mrcAmount: string;
  arcDuration: string;
  arcAmount: string;
};

type AdditionalIncomeItem = {
  name: string;
  duration: string;
  durationType: string; // e.g. 'Month(s)'
  price: string;
  vat?: string; // e.g. '7%'
};

/**
 * Additional tab: two independent toggles — "Additional Cost" and
 * "Additional Income" — each revealing its own "add"-able list once
 * enabled. Re-recorded against the live app; field labels verified via
 * chrome-devtools-axi (note the app's own typo: "Additonal Income
 * Details", not "Additional").
 */
async function fillPLAdditionalCostAndIncome(page: Page) {
  await page.getByRole('button', { name: SECTION_BUTTON_NAME.ADDITIONAL }).click();

  await toggleCategoryCheckbox(page, 'Additional Cost');
  await addAdditionalCostItem(page, {
    name: 'ADD COST Automation',
    otcAmount: '120',
    mrcDuration: '12',
    mrcDurationType: 'Month(s)',
    mrcAmount: '200',
    arcDuration: '1',
    arcAmount: '300',
  });

  await toggleCategoryCheckbox(page, 'Additional Income');
  await addAdditionalIncomeItem(page, { name: 'Add Income', duration: '2', durationType: 'Month(s)', price: '301', vat: '7%' });
}

/**
 * Scopes to the category section ("Additional Cost" or "Additional
 * Income") that owns the "add" button for that section's list. Needed
 * because once both categories are enabled, the page has two identically
 * named "add" buttons (one per table) — an unscoped
 * `getByRole('button', { name: 'add' }).first()` is DOM-order dependent and
 * silently clicks the Cost section's button when trying to add an Income
 * item (see incident: it re-opened "Creating Item in Additional Costs").
 *
 * `.last()` — same reason as toggleCategoryCheckbox: the label repeats
 * twice, once in a header block and once beside the checkbox; walking up
 * from the second occurrence is what lands inside the right container.
 *
 * Ancestor predicate keys off `.//table` (each category has exactly one —
 * "Additional Cost Detail, ..." vs "Additonal Income Details, ..."),
 * picked after two failed attempts:
 *   1. `button[normalize-space(.)="add"]` — raw-text equality on the "add"
 *      button never matched (its accessible name comes from an icon
 *      ligature, not necessarily equal to the element's full text content)
 *      and hung every click until timeout.
 *   2. `*[@role="checkbox"]` (mirroring toggleCategoryCheckbox) — matches,
 *      but lands one level too narrow: the checkbox and the add-button's
 *      list section are *siblings* under the real category container, so
 *      the nearest ancestor containing the checkbox doesn't contain the
 *      list/add-button branch at all.
 * A `<table>` only exists inside the list branch, so its nearest ancestor
 * is guaranteed to be (at least) the container that also holds the
 * checkbox and the add button — an existence check, not a text match, so
 * it's not sensitive to accessible-name computation quirks either.
 */
function categorySection(page: Page, label: 'Additional Cost' | 'Additional Income') {
  const labelNode = page.getByText(label, { exact: true }).last();
  return labelNode.locator(SELECTOR.NEAREST_ANCESTOR_WITH_TABLE);
}

async function addAdditionalCostItem(page: Page, data: AdditionalCostItem) {
  await categorySection(page, 'Additional Cost').getByRole('button', { name: BUTTON_NAME.ADD, exact: true }).first().click();
  await expect(page.getByText(creatingItemIn('Additional Costs'))).toBeVisible();

  await (await inputByLabel(page, 'Additional Cost Detail')).fill(data.name);
  await selectRadioByLabel(page, 'OTC/NRC Currency', 'USD');
  await (await inputByLabel(page, 'OTC/NRC Amount')).fill(data.otcAmount);
  await (await inputByLabel(page, 'MRC Duration')).fill(data.mrcDuration);
  await selectDropdownOption(page, 'MRC Duration Type', data.mrcDurationType);
  await selectRadioByLabel(page, 'MRC Currency', 'USD');
  await (await inputByLabel(page, 'MRC Amount')).fill(data.mrcAmount);
  await (await inputByLabel(page, 'ARC Duration (Year)')).fill(data.arcDuration);
  await selectRadioByLabel(page, 'ARC Currency', 'USD');
  await (await inputByLabel(page, 'ARC Amount')).fill(data.arcAmount);

  await page.getByRole('button', { name: BUTTON_NAME.SAVE, exact: true }).last().click();
}

async function addAdditionalIncomeItem(page: Page, data: AdditionalIncomeItem) {
  await categorySection(page, 'Additional Income').getByRole('button', { name: BUTTON_NAME.ADD, exact: true }).first().click();
  await expect(page.getByText(creatingItemIn('Additional Incomes'))).toBeVisible();

  // Note the app's own typo in this label: "Additonal", not "Additional".
  await (await inputByLabel(page, 'Additonal Income Details')).fill(data.name);
  await selectRadioByLabel(page, 'Currency', 'USD');
  await selectDropdownOption(page, 'Duration Type', data.durationType);
  await (await inputByLabel(page, 'Duration')).fill(data.duration);
  await (await inputByLabel(page, 'Price')).fill(data.price);
  if (data.vat) await selectDropdownOption(page, 'VAT (%)', data.vat);

  await page.getByRole('button', { name: BUTTON_NAME.SAVE, exact: true }).last().click();
}
