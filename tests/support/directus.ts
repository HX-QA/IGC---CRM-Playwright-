/**
 * Shared Playwright helpers for the IGC CRM Platform (Directus admin) test
 * suite. Extracted from the original combined
 * tests/requirement-od-pl.spec.ts so that every spec file (create-od,
 * create-pl, and the per-role approval-flow specs) shares one implementation
 * of: login, field lookups, relational/dropdown pickers, save/report
 * plumbing, and the OD/P&L creation steps — instead of copy-pasting them.
 *
 * NOTE ON SELECTORS
 * -------------------------------------------------------------------------
 * This app is a Directus admin UI. Selectors built from visible
 * labels/roles are the stable ones and are preferred everywhere possible.
 * A few widgets (numeric "spinbutton" steppers inside repeating cost-table
 * rows, the icon-only Save button, relational pickers) don't expose a
 * usable accessible name and fall back to structural/positional locators —
 * those are exactly what `npx playwright codegen` produces too. If one of
 * those breaks, re-record it by inspecting the live DOM
 * (`npx playwright test --debug`).
 */

import { Page, Locator, TestInfo, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export const BASE_URL = process.env.DMC_BASE_URL || 'https://dmc-dev.intergateway.net';

// ---------------------------------------------------------------------------
// Per-role credentials
// ---------------------------------------------------------------------------

/**
 * Every named user in the OD/P&L approval workflow. "salemarketing" is the
 * requester/creator role (also used by create-od.spec.ts / create-pl.spec.ts
 * to create the Requirement); the other three are the downstream approvers.
 */
export type Role = 'salemarketing' | 'solution' | 'vp-salemarketing' | 'vp-solution';

type Credentials = { email: string; password: string };

const ROLE_ENV_PREFIX: Record<Role, string> = {
  salemarketing: 'DMC', // kept as DMC_* for backward compatibility with the original spec/.env
  solution: 'SOLUTION',
  'vp-salemarketing': 'VP_SALEMARKETING',
  'vp-solution': 'VP_SOLUTION',
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} environment variable. Set it in .env.dev (or .env.production) — see .env.dev.example.`
    );
  }
  return value;
}

export function credentialsFor(role: Role): Credentials {
  const prefix = ROLE_ENV_PREFIX[role];
  return {
    email: requireEnv(`${prefix}_EMAIL`),
    password: requireEnv(`${prefix}_PASSWORD`),
  };
}

export async function login(page: Page, role: Role) {
  const { email, password } = credentialsFor(role);
  await page.goto(`${BASE_URL}/admin/login`);

  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).pressSequentially(email, { delay: 30 });
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).pressSequentially(password, { delay: 30 });

  const [loginResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/auth/login')),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);

  if (!loginResponse.ok()) {
    throw new Error(`Login failed for role "${role}": HTTP ${loginResponse.status()} ${await loginResponse.text()}`);
  }

  // Leaving /login only proves auth succeeded, not *where* it landed —
  // Directus can redirect to whatever page the account last visited (e.g. a
  // Role settings page from earlier manual/testing use), which has no
  // "Approval"/Requirements nav at all. Explicitly land on Content so every
  // caller (openApprovalInbox, createRequirement, ...) starts from the same
  // known app area regardless of that account's last-visited page.
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });
  await page.goto(`${BASE_URL}/admin/content`);
}

/**
 * Reuses an already-authenticated session instead of always performing a
 * fresh UI login. Intended for chained specs that stay on the *same* role
 * back-to-back (create-od -> create-pl -> salemarketing all run as
 * "salemarketing" — see playwright.config.ts's `auth-salemarketing` setup
 * project + storageState, which is what actually carries the session across
 * those spec files/projects).
 *
 * NOTE: checking `page.url()` right after `goto()` is NOT enough — Directus
 * renders the /admin/content shell optimistically before its async token
 * check resolves, so a stale/invalid session still shows a non-/login URL
 * for a moment before redirecting. That race let a dead session silently
 * pass this checkpoint once (session looked "reused" in ~1s, but every
 * later step ran against the Sign In screen). Instead, wait for a concrete
 * signed-in marker (the account menu, also used by signOut()) and only
 * treat the session as valid once that actually shows up.
 */
export async function ensureLoggedIn(page: Page, role: Role) {
  await page.goto(`${BASE_URL}/admin/content`);
  const authenticated = await page
    .getByRole('link', { name: 'account_circle' })
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!authenticated) {
    await login(page, role);
  }
}

const AUTH_DIR = path.resolve(__dirname, '../../.auth');

/** Where a role's saved session lives — shared by auth.setup.ts (writer) and playwright.config.ts (reader via `use.storageState`). */
export function authStateFile(role: Role): string {
  return path.join(AUTH_DIR, `${role}.json`);
}

/**
 * Persists the page's *current* session (cookies/local storage) back to the
 * role's auth-state file, overwriting whatever auth.setup.ts originally
 * wrote. Directus rotates the refresh token on every use — if this spec's
 * session auto-refreshed at any point during its run, the refresh token
 * captured back at setup time is now stale, and the *next* chained spec
 * (which reads the same file fresh) would hit `/auth/refresh` with an
 * already-consumed token and get logged out mid-run. Call this at the end
 * of every "salemarketing" spec except the last one in the chain (which
 * signs out instead — see signOut()).
 */
export async function saveSession(page: Page, role: Role) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: authStateFile(role) });
}

/**
 * Opens the account menu and signs out. The account flyout's "Sign Out" link
 * sometimes needs 1-2 clicks on an unlabeled expand toggle before it's
 * reachable (observed via codegen — Directus renders the menu in a couple of
 * steps), so this polls for the link instead of hardcoding a click count.
 */
export async function signOut(page: Page) {
  await page.getByRole('link', { name: 'account_circle' }).click();
  const signOutLink = page.getByRole('link', { name: 'Sign Out' });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await signOutLink.isVisible().catch(() => false)) break;
    await page.getByRole('button').nth(1).click().catch(() => {});
  }
  await signOutLink.click();
  await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
}

/**
 * The "Unsaved Changes" confirmation can pop up at unpredictable moments and
 * block whatever action is in progress underneath. addLocatorHandler checks
 * for it before every action and clicks through it automatically, then
 * retries the original action.
 */
export async function installKeepEditingHandler(page: Page) {
  await page.addLocatorHandler(page.getByRole('button', { name: 'Keep Editing' }), async () => {
    await page.getByRole('button', { name: 'Keep Editing' }).click();
  });
}

// ---------------------------------------------------------------------------
// Expected-result checkpoints and reporting
// ---------------------------------------------------------------------------

export type CheckpointStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export type CheckpointResult = {
  step: number;
  name: string;
  expected: string;
  status: CheckpointStatus;
  error?: string;
  durationMs?: number;
};

/**
 * Runs one flow step against its documented expected result and records the
 * outcome. Once any checkpoint has failed, later ones are recorded as
 * SKIPPED without being attempted — these flows are sequential/dependent, so
 * running e.g. "Approve OD" after "Sign in" failed would just produce a
 * confusing cascade of unrelated errors.
 */
export async function checkpoint(
  page: Page,
  report: CheckpointResult[],
  name: string,
  expected: string,
  fn: () => Promise<void>
) {
  const step = report.length + 1;
  if (report.some((r) => r.status === 'FAIL')) {
    report.push({ step, name, expected, status: 'SKIPPED' });
    return;
  }
  const start = Date.now();
  try {
    await fn();
    report.push({ step, name, expected, status: 'PASS', durationMs: Date.now() - start });
  } catch (e) {
    report.push({
      step,
      name,
      expected,
      status: 'FAIL',
      error: (e as Error).message,
      durationMs: Date.now() - start,
    });
  }
}

/** Fails if the current dialog shows Directus's "invalid values" validation banner. */
export async function expectNoValidationError(page: Page) {
  const errorBanner = page.getByText('The following fields have invalid values');
  if (await errorBanner.isVisible().catch(() => false)) {
    const detail = await errorBanner
      .locator('xpath=following-sibling::*[1]')
      .innerText()
      .catch(() => '(could not read detail)');
    throw new Error(`Validation error shown: ${detail}`);
  }
}

/**
 * Writes the pass/fail report as Markdown + JSON, both to a fixed path under
 * reports/<slug>-report.* (easy to open directly) and as Playwright test
 * attachments (visible in `npx playwright show-report`). Each spec file
 * passes its own slug/title so parallel/chained runs don't overwrite each
 * other's report.
 */
export async function writeReport(
  testInfo: TestInfo,
  report: CheckpointResult[],
  opts: { title: string; slug: string }
) {
  const statusLabel: Record<CheckpointStatus, string> = { PASS: 'PASS', FAIL: 'FAIL', SKIPPED: 'SKIPPED' };
  const lines = [
    `# Test Report: ${opts.title}`,
    '',
    `Run at: ${new Date().toISOString()}`,
    `Environment: ${BASE_URL}`,
    '',
    '| # | Step | Expected Result | Status | Duration (ms) |',
    '|---|------|------------------|--------|----------------|',
    ...report.map(
      (r) => `| ${r.step} | ${r.name} | ${r.expected} | ${statusLabel[r.status]} | ${r.durationMs ?? '-'} |`
    ),
    '',
  ];
  const failures = report.filter((r) => r.status === 'FAIL');
  if (failures.length > 0) {
    lines.push('## Failure details', '');
    for (const f of failures) {
      lines.push(`### ${f.name}`, '', f.error ?? '(no error message)', '');
    }
  }
  const passCount = report.filter((r) => r.status === 'PASS').length;
  const skipCount = report.filter((r) => r.status === 'SKIPPED').length;
  lines.push(`## Summary: ${passCount} passed, ${failures.length} failed, ${skipCount} skipped`);

  const markdown = lines.join('\n');
  const json = JSON.stringify(report, null, 2);
  const chatText = formatForChat(report, passCount, failures.length, skipCount, opts.title);

  console.log('\n' + markdown + '\n');

  const reportsDir = path.resolve(__dirname, '..', '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, `${opts.slug}-report.md`), markdown);
  fs.writeFileSync(path.join(reportsDir, `${opts.slug}-report.json`), json);
  fs.writeFileSync(path.join(reportsDir, `${opts.slug}-report.txt`), chatText);

  await testInfo.attach('expected-result-report.md', { body: markdown, contentType: 'text/markdown' });
  await testInfo.attach('expected-result-report.json', { body: json, contentType: 'application/json' });
  await testInfo.attach('expected-result-report-chat.txt', { body: chatText, contentType: 'text/plain' });
}

/**
 * Plain-text report using Google Chat's supported message formatting
 * (*bold*, no Markdown tables/headings) — meant to be copy-pasted straight
 * into a Chat message or forwarded as a .txt attachment.
 */
function formatForChat(
  report: CheckpointResult[],
  passCount: number,
  failCount: number,
  skipCount: number,
  title: string
): string {
  const lines = [
    `*Test Report: ${title}*`,
    `Run at: ${new Date().toISOString()}`,
    `Environment: ${BASE_URL}`,
    `Result: *${passCount} passed / ${failCount} failed / ${skipCount} skipped*`,
    '',
  ];
  for (const r of report) {
    const header = `${r.step}. ${r.name} — ${r.status}`;
    lines.push(r.status === 'FAIL' ? `*${header}*` : header);
    lines.push(`   Expected: ${r.expected}`);
    if (r.error) {
      lines.push('   Error:', '```', r.error.trim().slice(0, 500), '```');
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// Requirement / OD / P&L creation
// ---------------------------------------------------------------------------

export type RequirementData = {
  customerName: string;
  receivedChannel: string;
  projectName: string;
  requirementDetail: string;
  salesperson: string;
};

export async function createRequirement(page: Page, data: RequirementData): Promise<string> {
  await page.goto(`${BASE_URL}/admin/content/requirements`);
  await page.waitForLoadState('networkidle');

  // Top-right "+" (Create Item) link.
  await page.locator('a[href="/admin/content/requirements/+"]').click();
  await page.waitForURL('**/admin/content/requirements/+');

  await selectRelationalItem(page, 'Customer Name', data.customerName);
  await selectDropdownOption(page, 'Received Channel', data.receivedChannel);

  await (await inputByLabel(page, 'Project Name')).fill(data.projectName);
  await (await inputByLabel(page, 'Requirement Detail')).fill(data.requirementDetail);

  await selectRelationalItem(page, 'Salesperson', data.salesperson);

  await saveNestedItem(page); // saves the create-item panel, returns to the collection list
  // saveNestedItem's fixed 500ms wait is tuned for closing a nested OD/P&L
  // dialog — creating a top-level Requirement also redirects the URL back to
  // the plain list and re-fetches its data, which can take longer.
  await page.waitForURL((url) => url.pathname.endsWith('/requirements'), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle');

  // Saving a new item lands back on the list. This is a shared dev database
  // with real concurrent activity and its own pagination (default sort here
  // isn't newest-first), so neither "top row = ours" nor "our row is on the
  // current page" is reliable. Bump Per Page to 1000 so our (caller-supplied,
  // should-be-unique) project name is guaranteed to be in the DOM to match.
  await setMaxPerPage(page, page);

  const newRow = page.getByRole('row', { name: data.projectName }).first();
  const reqNo = (await newRow.getByText(/^REQ-\d{2}-\d{3}$/).innerText()).trim();

  await newRow.click();
  await page.waitForURL('**/admin/content/requirements/*');

  return reqNo;
}

/** Navigates to Content > Requirements, opens the row for `reqNo`, and lands on its edit view. */
export async function openRequirementByReqNo(page: Page, reqNo: string) {
  await page.goto(`${BASE_URL}/admin/content/requirements`);
  await page.waitForLoadState('networkidle');
  await setMaxPerPage(page, page);
  await page.getByRole('row', { name: reqNo }).first().click();
  await page.waitForURL('**/admin/content/requirements/*');
}

export async function openRequirementAllFormsTab(page: Page) {
  await page.getByRole('tab', { name: 'Requirement All Forms' }).click();
  await expect(page.getByText('Opportunity Decision (OD)')).toBeVisible();
  // The section title renders before its "Create New" button's permission
  // check finishes — without this wait, headless mode (faster than headed)
  // can reach the button click before it's enabled.
  await page.waitForLoadState('networkidle');
}

export type ODData = {
  requestor: string;
  routeFrom: string;
  routeTo: string;
  altOption: string; // e.g. 'DMS'
  ihOption: string; // e.g. 'MK'
  estimatedProjectTimeline: string;
  budgetary: string;
  estimatedValue: string;
  remark: string;
  other: string;
};

export async function createOpportunityDecision(page: Page, data: ODData) {
  await clickCreateNewInSubsection(page, 'Opportunity Decisions');

  await expect(page.getByText('Creating Item in OD')).toBeVisible();
  // The slide-over panel is still animating in when its heading becomes
  // visible — interacting with fields immediately can hit "not stable".
  await page.waitForTimeout(500);

  await pickDateToday(page, 'Date');

  // Company defaults to "IGC" — leave as is.
  // These are custom toggle buttons (role="checkbox" but state lives in
  // aria-pressed, not aria-checked), so use .click() — .check() asserts
  // aria-checked changed and always fails here even though the click works.
  await page.getByRole('checkbox', { name: 'Product' }).click();

  await (await inputByLabel(page, 'Route From')).fill(data.routeFrom);
  await (await inputByLabel(page, 'Route To')).fill(data.routeTo);

  await selectRelationalItem(page, 'Requestor', data.requestor);

  await page.getByRole('checkbox', { name: data.altOption }).click(); // ALT group
  await page.getByRole('checkbox', { name: data.ihOption }).click(); // IH group

  await (await inputByLabel(page, 'Estimated Project Timeline')).fill(data.estimatedProjectTimeline);
  await (await inputByLabel(page, 'Budgetary')).fill(data.budgetary);
  // This numeric field's v-model doesn't sync from fill() (or blur) — it
  // needs real keystroke events, like the login fields did.
  const estimatedValueInput = await inputByLabel(page, 'Estimated Value');
  await estimatedValueInput.click();
  await estimatedValueInput.pressSequentially(data.estimatedValue, { delay: 30 });
  await (await inputByLabel(page, 'Remark')).fill(data.remark);
  await (await inputByLabel(page, 'Other')).fill(data.other);

  // "Document for Decision" toggles (Standard TOR, Repeat Order x2, BOQ) are
  // Enabled by default — no action needed unless the test requires otherwise.
}

export type PLData = {
  licenseType: string; // e.g. '2'
  countryJob: string; // e.g. 'Domestic'
  jobCode: string; // e.g. 'Opex'
  capacity: string; // e.g. '500'
  salesperson: string;
  // Circuit ID has a uniqueness constraint enforced at outer-Requirement
  // save time (not when this nested Circuit item itself is created) — the
  // P&L's "Circuits" section left empty ("No items") still failed
  // validation with "circuit_id: Value has to be unique" the moment the
  // caller tried to save. Every P&L needs its own never-reused value; see
  // create-pl.spec.ts for the retry-safe generation of this.
  circuitId: string;
};

export async function createProfitLossStatement(page: Page, data: PLData) {
  // The section header repeats the exact subsection title, so target the
  // second (subsection) occurrence, not the first (category header).
  await clickCreateNewInSubsection(page, 'Profit Loss Statements', { last: true });

  await expect(page.getByText('Creating Item in P&L')).toBeVisible();
  // The slide-over panel is still animating in — and its form is heavier
  // than OD's (License Type/Country Job/Job Code option lists to fetch) —
  // when its heading becomes visible, so wait for both the animation and
  // any in-flight requests to settle before touching the first field.
  await page.waitForTimeout(500);
  await page.waitForLoadState('networkidle');

  // Information tab (default active)
  await selectDropdownOption(page, 'License Type', data.licenseType);
  await selectDropdownOption(page, 'Country Job', data.countryJob);
  await selectDropdownOption(page, 'Job Code', data.jobCode);
  await (await inputByLabel(page, 'Capacity')).fill(data.capacity);
  await selectRelationalItem(page, 'Salesperson', data.salesperson);

  // Scroll to the date/customer fields further down the panel.
  await (await fieldByLabel(page, 'Exchange Rate Date')).locator('.input').first().click();
  // Same inline-dropdown widget as the Salesperson picker (Deselect/Search
  // listitems followed by date options) — pick the first date-shaped one.
  await page.getByRole('listitem').filter({ hasText: /^\d{4}-\d{2}-\d{2}$/ }).first().click();

  // "Period Date" (a single date-range field) replaced the old separate
  // Start Date/End Date fields and comes pre-filled with a valid default
  // (today through +1 year) — no interaction needed.

  // Requirement No. / Project Name / Customer Name are auto-linked from the
  // parent Requirement — no action needed.

  // Circuits — required despite the section itself allowing "No items";
  // Directus only rejects the missing/duplicate Circuit ID when the outer
  // Requirement is saved, not when this nested item is created.
  //
  // Idempotent by design: Circuit ID has a uniqueness constraint, so this
  // must never add a second one to a P&L that already has one — check
  // first, and only create when the section is genuinely empty.
  const circuitsSection = subsectionContainer(page, 'Circuits');
  const alreadyHasCircuit = await circuitsSection
    .getByRole('listitem')
    .first()
    .isVisible()
    .catch(() => false);
  if (!alreadyHasCircuit) {
    await clickCreateNewInSubsection(page, 'Circuits');
    await expect(page.getByText('Creating Item in Circuit ID')).toBeVisible();
    await (await inputByLabel(page, 'Circuit ID')).fill(data.circuitId);
    await saveNestedItem(page); // closes the Circuit sub-panel, back to the P&L's Information tab
  }
}

/**
 * Reads the record number (e.g. "OD-26-174", "PL-26-172") off the first
 * child listitem inside a subsection, once it has at least one item. Used
 * right after creating+saving a nested OD/P&L so its number can be handed
 * off to the next spec file via flow-state.ts.
 */
export async function readSubsectionItemNo(
  page: Page,
  subsectionLabel: string,
  pattern: RegExp,
  opts?: { last?: boolean }
): Promise<string> {
  const section = subsectionContainer(page, subsectionLabel, opts);
  // Assert the section itself is on screen *first*, with a bounded timeout.
  // Without this, a caller that ended up on the wrong page (e.g. a stale
  // reload bounced back to the collection list instead of the item view)
  // gets no useful signal here — the later .innerText() call below has no
  // timeout of its own, so it would silently inherit the *whole test's*
  // remaining budget and fail 60s later with a generic "Test timeout
  // exceeded" that doesn't point at the real problem (wrong page).
  await expect(section, `"${subsectionLabel}" section not found — check you're still on the Requirement All Forms tab`).toBeVisible({
    timeout: 10_000,
  });
  const item = section.getByRole('listitem').filter({ hasText: pattern }).first();
  await expect(item, `No item matching ${pattern} in subsection "${subsectionLabel}"`).toBeVisible({ timeout: 10_000 });
  const text = await item.innerText();
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Could not find an item matching ${pattern} in subsection "${subsectionLabel}". Got: "${text}"`);
  }
  return match[0];
}

/**
 * Resolves a subsection's own container by walking up from its label text to
 * the nearest ancestor that also contains a "Create New" button — this
 * avoids hardcoding how many levels separate the label from its content,
 * and scopes queries (e.g. "No items") to just that subsection.
 */
export function subsectionContainer(page: Page, subsectionLabel: string, opts?: { last?: boolean }): Locator {
  const label = opts?.last
    ? page.getByText(subsectionLabel, { exact: true }).last()
    : page.getByText(subsectionLabel, { exact: true }).first();
  return label.locator('xpath=ancestor::*[.//button[contains(., "Create New")]][1]');
}

export async function clickCreateNewInSubsection(page: Page, subsectionLabel: string, opts?: { last?: boolean }) {
  const section = subsectionContainer(page, subsectionLabel, opts);
  const button = section.getByRole('button', { name: 'Create New' }).first();
  // The button can render disabled briefly while its permission check
  // resolves; wait for it to become enabled instead of racing the click.
  await expect(button).toBeEnabled({ timeout: 15000 });

  // After a hard page reload (see saveOuterRequirement), the click has
  // sometimes silently done nothing — no error, but no panel opens either,
  // as if it landed on a stale element reference from a layout that hadn't
  // finished settling. Verify a new panel actually opened and retry if not,
  // rather than letting the caller fail confusingly on some field lookup.
  const articlesBefore = await page.locator('article').count();
  for (let attempt = 1; attempt <= 3; attempt++) {
    await button.click();
    const opened = await page
      .locator('article')
      .nth(articlesBefore)
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
  }
  throw new Error(`Clicking "Create New" for "${subsectionLabel}" did not open a new panel after 3 attempts.`);
}

export async function saveNestedItem(page: Page) {
  // Dialog/panel save button — the icon-only checkmark, top-right of the
  // slide-over panel. Its accessible name is the Material icon ligature "check".
  await page.getByRole('button', { name: 'check', exact: true }).last().click();
  // Wait for the slide-over to close and the underlying page to settle.
  await page.waitForTimeout(500);
}

export async function saveOuterRequirement(page: Page, reqNo: string) {
  const saveButton = page.getByRole('button', { name: 'check', exact: true }).last();
  // If the outer Requirement genuinely has no pending field changes, its
  // Save button stays disabled/loading and never becomes clickable — treat
  // that as "nothing to save" rather than burning the whole test budget.
  let saved = false;
  try {
    await saveButton.click({ timeout: 5000 });
    await page.waitForLoadState('networkidle');
    saved = true;
  } catch {
    // Nothing pending on the outer record.
  }
  if (!saved) return;

  // A save that actually persisted a change redirects back to the plain
  // collection list — same behavior as after creating a brand-new item —
  // instead of staying on the edit view. BUT that redirect is a *delayed*
  // client-side route change (fires sometime after the save response, not
  // synchronously with it), so checking page.url() right after
  // waitForLoadState('networkidle') is a race: it can still show the item
  // URL here and then flip to the list a moment later, mid-way through
  // whatever the caller does next (observed as an assertion deep inside a
  // *later* step timing out because the page had quietly navigated out from
  // under it). Sidestep the race entirely: always explicitly re-navigate to
  // the Requirement by its number and reopen the tab, regardless of what
  // page.url() happens to show right now.
  await page.waitForTimeout(1500); // let any delayed redirect actually happen first
  await openRequirementByReqNo(page, reqNo);
  await openRequirementAllFormsTab(page);
  // networkidle only tracks network activity, not the client-side
  // re-render/reactive-state sync Vue does afterward. A human naturally
  // pauses here; the script doesn't, which is when the next nested-item
  // creation has intermittently raced this settle-down. Give it real time.
  await page.waitForTimeout(2000);
}

// ---------------------------------------------------------------------------
// Reusable field helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the field container for a given visible label text.
 *
 * Scoped to the topmost open dialog (if any) — a background page (e.g. the
 * Requirement edit view) stays in the DOM behind a nested OD/P&L dialog and
 * may contain a field with matching text too. Within that scope we take the
 * *first* match: some forms repeat a label for an auto-linked read-only
 * reference further down (e.g. P&L's own "Salesperson" field vs. the
 * auto-linked one in its "Information" section) — the editable field is
 * always the earlier one.
 *
 * exact:true matters too — e.g. "Capacity" is a substring of the separate
 * "Capacity Unit" field, so inexact matching would grab the wrong one.
 */
export async function fieldByLabel(page: Page, label: string): Promise<Locator> {
  const dialogs = page.locator('article');
  const scope = (await dialogs.count()) > 0 ? dialogs.last() : page;
  return scope
    .locator('.field, .v-form .field')
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
}

/**
 * Plain text/textarea input for a given field label. Labels in this app are
 * rendered as sibling text, not wired via <label for> or aria-labelledby, so
 * getByLabel() never matches — resolve via the field container instead.
 */
export async function inputByLabel(page: Page, label: string): Promise<Locator> {
  return (await fieldByLabel(page, label)).locator('input, textarea').first();
}

/**
 * Bumps a paginated list's "Per Page" control from the default 25 to 1000,
 * so a target row is guaranteed to be in the DOM instead of on some later
 * page. "Per Page" is a plain label — its next sibling is the v-select's
 * off-screen menu wrapper, not the visible trigger, so click the visible
 * "25" value text instead. Best effort: callers should have their own
 * fallback (e.g. searching) for when this control isn't present.
 */
export async function setMaxPerPage(page: Page, scope: Locator | Page) {
  const ready = await scope
    .getByText('Per Page', { exact: true })
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) return;
  await scope
    .getByText('25', { exact: true })
    .last()
    .click({ timeout: 5000 })
    .then(() => page.getByText('1000', { exact: true }).first().click({ force: true, timeout: 5000 }))
    .then(() => page.waitForLoadState('networkidle'))
    .catch(() => {});
}

/**
 * Directus "select an item" relational picker (m2o). Two distinct widgets
 * exist for the same field type: a full-screen "Select Item" modal with a
 * paginated table (rows carry the combined text of every column, including
 * email), or a small inline dropdown with a plain listitem per record
 * (shows only the display name — no email). Detected by whether a new
 * <article> actually appears after opening the picker.
 */
export async function selectRelationalItem(page: Page, label: string, itemText: string) {
  const field = await fieldByLabel(page, label);
  const articlesBefore = await page.locator('article').count();
  await field.locator('.input').first().click();

  const opensFullModal = await page
    .locator('article')
    .nth(articlesBefore)
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  if (opensFullModal) {
    const dialog = page.locator('article').last();
    await setMaxPerPage(page, dialog);

    // Scope to the just-opened dialog: page-wide getByPlaceholder('Search')
    // also matches the sidebar's "Search Collection..." box.
    const modalSearch = dialog.getByPlaceholder(/search/i);
    const modalSearchReady = await modalSearch
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (modalSearchReady) {
      await modalSearch.fill(itemText);
      await page.waitForLoadState('networkidle');
      // The search is debounced client-side — networkidle alone doesn't
      // guarantee the filtered rows have actually rendered yet (same root
      // cause as searchApprovalInbox's timing bug). Wait for the searched-for
      // text itself before clicking, so this doesn't race a still-stale list.
      await dialog.getByText(itemText, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
    }

    // Match against the row's combined accessible name — some tables split a
    // name across separate cells (e.g. First Name / Last Name), so no single
    // text node contains itemText, but the row's full name does.
    await page.getByRole('row', { name: itemText }).first().click();

    // The dialog stays open after picking a row; confirm/close it.
    const confirmButton = dialog.getByRole('button', { name: 'check', exact: true });
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click();
    }
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  } else {
    // Inline dropdown: a small popup with its own "Search" box and a plain
    // listitem per record (display name only — matches by name, not email).
    const inlineSearch = page.getByRole('textbox', { name: 'Search', exact: true });
    if (await inlineSearch.isVisible().catch(() => false)) {
      await inlineSearch.fill(itemText);
      await page.waitForLoadState('networkidle').catch(() => {});
      // Same debounced-search timing gap as the modal branch above.
      await page
        .getByRole('listitem')
        .filter({ hasText: itemText })
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .catch(() => {});
    }
    await page.getByRole('listitem').filter({ hasText: itemText }).first().click();
    // Same lingering-menu risk as selectDropdownOption's popup — wait for it
    // to actually close before the caller moves on to the next field.
    await page.locator('#menu-outlet').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

/** Standard Directus <select>/dropdown field (radio-style value list). */
export async function selectDropdownOption(page: Page, label: string, optionText: string) {
  const field = await fieldByLabel(page, label);
  await field.locator('.input').first().click();
  // The options popup renders into a shared #menu-outlet portal, detached
  // from the field's own DOM subtree, under the dialog's own overlay
  // (z-index quirk) — force bypasses that. Short option labels like License
  // Type's "2"/"3" aren't unique page-wide, though (e.g. "2" also matches an
  // unrelated badge elsewhere in the chrome) — page.getByText(...).first()
  // can silently click that instead of the real option, leaving the field
  // null with no error. Scope to the portal so only actual menu items match.
  const menu = page.locator('#menu-outlet');
  const option = menu.getByText(optionText, { exact: true }).first();
  await option.waitFor({ state: 'visible', timeout: 5000 });
  await option.click({ force: true });
  // The dropdown's menu portal can linger open after picking an option and
  // intercept clicks on whatever field comes next — wait for it to clear.
  await page.locator('#menu-outlet').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
}

/**
 * Clicks the "Enabled" checkbox for a cost-category toggle row (e.g. P&L's
 * "Marketing Assistance", "Additional Cost", "Additional Income"). Unlike
 * the OD/PL top-level form fields, these rows aren't wrapped in a `.field`
 * container fieldByLabel can key off — the label repeats twice (once in a
 * separate header block, once directly beside the checkbox) with no shared
 * class name, so this walks up from the *second* occurrence to the nearest
 * ancestor that also contains a checkbox and clicks that.
 */
export async function toggleCategoryCheckbox(page: Page, label: string) {
  const labelNode = page.getByText(label, { exact: true }).last();
  const row = labelNode.locator('xpath=ancestor::*[.//*[@role="checkbox"]][1]');
  await row.getByRole('checkbox').click();
}

/**
 * Custom toggle-style radio group (role="button", state via aria-pressed,
 * accessible name is "radio_button_(un)checked <option>") scoped to the
 * field container for `label`. These OTC/MRC/ARC "Currency" and "Uso
 * Fee"/"Currency" fields on the P&L cost tabs repeat the same label text
 * across several sibling cost-detail panels (e.g. Sale Cost's Marketing
 * Assistance panel vs. the Additional Cost item dialog both have their own
 * "MRC Currency") — unscoped page-wide lookups drift across whichever of
 * those happens to be mounted, which is what made the original
 * codegen-transcribed nth()-based selectors fragile. Scoping to the labeled
 * field (same trick as fieldByLabel) avoids that.
 */
export async function selectRadioByLabel(page: Page, label: string, optionText: string) {
  const field = await fieldByLabel(page, label);
  await field.getByRole('button', { name: new RegExp(`radio_button_(un)?checked ${optionText}$`) }).click();
}

/** Opens a Directus date-picker field and selects today's date. */
export async function pickDateToday(page: Page, label: string) {
  const field = await fieldByLabel(page, label);
  await field.locator('.input').first().click();
  await page.getByText('Set to Now').click().catch(async () => {
    // Fallback: click the highlighted/today cell in the calendar grid.
    await page.locator('.today, [aria-current="date"]').first().click();
  });
}

// ---------------------------------------------------------------------------
// Approval-inbox navigation (shared by the solution / vp-* approval specs)
// ---------------------------------------------------------------------------

/**
 * Opens the left-nav "order_approve OD" / "order_approve P&L" approval
 * inbox link (the icon is the accessible name's first word, exactly as
 * Directus renders it) and clears any lingering detail panel from a
 * previous visit via its "close" button.
 *
 * The sidebar's "Approval" section starts collapsed (icon + chevron_right)
 * — its OD/P&L sub-links don't exist in the DOM at all until it's clicked
 * open, so this expands it first whenever the target link isn't already
 * visible (a no-op if some earlier step already expanded it).
 */
export async function openApprovalInbox(page: Page, kind: 'OD' | 'P&L') {
  const link = page.getByRole('link', { name: `order_approve ${kind}` });
  if (!(await link.isVisible().catch(() => false))) {
    await page.getByRole('listitem').filter({ hasText: 'Approval' }).last().click();
    await link.waitFor({ state: 'visible', timeout: 5000 });
  }
  await link.click();
  await page.waitForLoadState('networkidle');
  const closeButton = page.getByRole('button', { name: 'close' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }
}

/** Uses the inbox's search box to filter down to a single OD/P&L number. */
export async function searchApprovalInbox(page: Page, no: string) {
  await page.getByRole('button', { name: 'search' }).click();
  await page.getByRole('searchbox', { name: 'Search Items...' }).fill(no);
  await page.waitForLoadState('networkidle');
  // The search is debounced client-side — networkidle only tracks network
  // requests, not the (also debounced) re-render of the filtered rows. A
  // caller that immediately clicks a status cell after this returns can
  // land on the still-unfiltered list (observed: 9 unrelated rows all
  // matching "Waiting for initiation"). Wait for a row containing the
  // searched-for number itself before returning, so callers only proceed
  // once the list has actually narrowed down.
  await page.getByText(no, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
}
