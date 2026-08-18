/**
 * Centralized UI element identifiers for the IGC CRM Platform (Directus
 * admin) test suite — the "locator config file".
 *
 * WHY THIS FILE EXISTS
 * -------------------------------------------------------------------------
 * Every helper/spec file used to write raw strings straight into
 * page.getByRole(...) / getByText(...) / page.locator(...) calls, e.g.
 * `getByRole('button', { name: 'check', exact: true })` for a Save button,
 * or `'order_approve OD'` for a nav link. That works fine for Playwright,
 * but it's opaque to anyone reading the test who doesn't already know this
 * particular Directus UI — "check" doesn't look like a Save button at a
 * glance, and "order_approve OD" doesn't look like a navigation link.
 *
 * This file gives every one of those raw strings a descriptive name, grouped
 * by what kind of UI element it is, so call sites read
 * `getByRole('button', { name: BUTTON_NAME.SAVE, exact: true })` instead of
 * `getByRole('button', { name: 'check', exact: true })`.
 *
 * WHAT THIS FILE IS *NOT*
 * -------------------------------------------------------------------------
 * These are plain strings/regexes/booleans, not Locator objects — a Locator
 * needs a `page` (or a scoping container) bound to it, and the same button
 * name (e.g. "Save") gets queried against different scopes throughout this
 * suite (a dialog, a specific section, the whole page). Pass these values
 * into page.getByRole/getByText/page.locator/etc. exactly where the raw
 * literal used to go — the surrounding `{ name: ..., exact: ... }` call
 * shape is unchanged, only the leaf value now has a name.
 *
 * If a selector here ever breaks, re-record it with `npx playwright test
 * --debug` or `npx playwright codegen` and update the value here — every
 * caller picks up the fix automatically.
 */

// ---------------------------------------------------------------------------
// Buttons — getByRole('button', { name: BUTTON_NAME.X })
// ---------------------------------------------------------------------------
export const BUTTON_NAME = {
  /** Login form's submit button. */
  SIGN_IN: /sign in/i,
  /** Icon-only checkmark — the accessible name is the Material icon
   *  ligature "check", not the word "Save". This is the Save button on
   *  every nested-item dialog (OD/P&L/Circuit/Income/Additional cost/...),
   *  the outer Requirement panel, and various confirm sub-dialogs. */
  SAVE: 'check',
  /** "+" button that opens a subsection's create-item panel (Opportunity
   *  Decisions, Profit Loss Statements, Circuits). */
  CREATE_NEW: 'Create New',
  /** "+ add" button that appends a new repeating-list row (Income,
   *  Additional Cost/Income, Solution Cost EP/Cost line items). */
  ADD: 'add',
  /** Kebab (⋮) menu that reveals "Save and Stay" and other actions. */
  MORE_ACTIONS: 'more_vert',
  /** Directus's own "Keep Editing" button on the unsaved-changes prompt. */
  KEEP_EDITING: 'Keep Editing',
  /** "×" close button on a detail panel / approval-inbox row. */
  CLOSE: 'close',
  /** Magnifying-glass icon that reveals the approval inbox's search box. */
  SEARCH: 'search',
  /** Bulk-action "delete" button (cleanup utility). */
  DELETE: 'delete',
  /** Confirm button on the "Are you sure you want to delete..." prompt. */
  DELETE_CONFIRM: 'Delete',
  /** Dual-pane date-range calendar's month-step buttons. */
  PREVIOUS_MONTH: 'Previous month',
  NEXT_MONTH: 'Next month',
  /** Custom toggle-style radio option, unchecked state, generic. Combine
   *  with an option's own text where one is needed to disambiguate (see
   *  directus.ts's selectRadioByLabel for the labeled/scoped version). */
  RADIO_UNCHECKED: 'radio_button_unchecked',
  /** Same custom radio, specifically the "USD" currency option — repeats
   *  identically across several P&L cost-detail panels. */
  RADIO_UNCHECKED_USD: 'radio_button_unchecked USD',
  /** Same custom radio, specifically the P&L/OD "Approve" decision option. */
  RADIO_UNCHECKED_APPROVE: 'radio_button_unchecked Approve',
} as const;

/** Section-switch buttons on the OD/P&L forms (role="button", not a real ARIA tab). */
export const SECTION_BUTTON_NAME = {
  APPROVAL: 'Approval',
  COMMON_COST: 'Common Cost',
  SALE_COST: 'Sale Cost',
  INCOME: 'Income',
  ADDITIONAL: 'Additional',
  SOLUTION_COST: 'Solution Cost',
} as const;

// ---------------------------------------------------------------------------
// Links — getByRole('link', { name: LINK_NAME.X })
// ---------------------------------------------------------------------------
export const LINK_NAME = {
  /** Top-right account flyout toggle — icon-only, accessible name is the icon ligature. */
  ACCOUNT_MENU: 'account_circle',
  SIGN_OUT: 'Sign Out',
} as const;

/** The left-nav "order_approve OD" / "order_approve P&L" approval-inbox link — the icon is literally the first word of Directus's own accessible name. */
export function approvalInboxLinkName(kind: 'OD' | 'P&L'): string {
  return `order_approve ${kind}`;
}

// ---------------------------------------------------------------------------
// Tabs (real role="tab") — getByRole('tab', { name: TAB_NAME.X })
// ---------------------------------------------------------------------------
export const TAB_NAME = {
  REQUIREMENT_ALL_FORMS: 'Requirement All Forms',
} as const;

// ---------------------------------------------------------------------------
// Textboxes / searchboxes
// ---------------------------------------------------------------------------
export const TEXTBOX_NAME = {
  EMAIL: 'Email',
  PASSWORD: 'Password',
  /** Inline relational-picker popup's own search box (distinct from the full-modal picker's placeholder search — see PLACEHOLDER.SEARCH). */
  INLINE_PICKER_SEARCH: 'Search',
} as const;

export const SEARCHBOX_NAME = {
  APPROVAL_INBOX: 'Search Items...',
} as const;

export const PLACEHOLDER = {
  /** Full-modal relational-picker's search input placeholder. */
  SEARCH: /search/i,
} as const;

// ---------------------------------------------------------------------------
// Checkboxes — getByRole('checkbox', { name: CHECKBOX_NAME.X })
// ---------------------------------------------------------------------------
export const CHECKBOX_NAME = {
  /** An approval-checklist item awaiting confirmation. */
  INDETERMINATE: 'indeterminate_check_box',
  /** A generic unchecked checklist item (no further qualifying text). */
  UNCHECKED_BLANK: 'check_box_outline_blank',
  /** OD creation form's own Company/Customer "Product" type toggle (createOpportunityDecision). */
  OD_PRODUCT_TOGGLE: 'Product',
  /** The required "Customer Business Type: Product" checklist item — shows up with this exact accessible name both on the requester's OD-approval-tab view (salemarketing.spec.ts) and the VP approval-inbox's own view of the same OD (vp-salemarketing.spec.ts). */
  MARKETING_PRODUCT_REQUIRED: 'check_box_outline_blank Product',
} as const;

// ---------------------------------------------------------------------------
// Plain text content — getByText(TEXT.X)
// ---------------------------------------------------------------------------
export const TEXT = {
  INVALID_VALUES_BANNER: 'The following fields have invalid values',
  PER_PAGE: 'Per Page',
  PAGE_SIZE_25: '25',
  PAGE_SIZE_1000: '1000',
  NO_ITEMS: 'No items',
  SAVE_AND_STAY: 'Save and Stay',
  SORT_DESCENDING: 'Sort Descending',
  SET_TO_NOW: 'Set to Now',
  MONTH_S: 'Month(s)',
  MARKETING_DEPARTMENT: 'Marketing Department',
  PM_DEPARTMENT: 'PM Department',
  WAITING_FOR_INITIATION: 'Waiting for initiation',
  WAITING_FOR_APPROVE: 'Waiting for approve',
} as const;

/** The slide-over panel's heading while a nested item is being created, e.g. creatingItemIn('OD') -> "Creating Item in OD". */
export function creatingItemIn(kind: string): string {
  return `Creating Item in ${kind}`;
}

/** cleanup-mock-requirements.spec.ts's bulk-delete confirmation prompt. */
export function deleteConfirmPrompt(): RegExp {
  return /Are you sure you want to delete these \d+ items\?/;
}

// ---------------------------------------------------------------------------
// Structural / portal selectors — page.locator(SELECTOR.X)
// These have no accessible name at all (icon-only widgets, shared render
// portals, generic containers), so a CSS/XPath fragment is the only
// identifier available. Centralized anyway so call sites read as named
// references instead of unexplained punctuation.
// ---------------------------------------------------------------------------
export const SELECTOR = {
  /** Every slide-over "Creating Item in ..." dialog/panel renders as its own `<article>`. */
  DIALOG_PANEL: 'article',
  /** Shared portal Directus renders dropdown/relational-picker popups into, detached from the triggering field's own DOM subtree. */
  MENU_OUTLET: '#menu-outlet',
  /** Shared portal for confirmation sub-dialogs stacked on top of an already-open panel (e.g. the checklist "check" confirm). */
  DIALOG_OUTLET: '#dialog-outlet',
  /** A form field's own wrapper — labels here are sibling text, not wired via `<label for>`, so this is how fieldByLabel finds a field by its visible label. */
  FIELD_CONTAINER: '.field, .v-form .field',
  INPUT_OR_TEXTAREA: 'input, textarea',
  /** A field's own clickable trigger area (opens its dropdown/picker/date-picker popup) — scoped to a `fieldByLabel()` result, so this generic class is unambiguous in context. */
  FIELD_INPUT_TRIGGER: '.input',
  /** Fallback "today" cell in a date-picker calendar grid, used when "Set to Now" isn't available. */
  TODAY_CELL: '.today, [aria-current="date"]',
  /** Period-date range picker's own trigger input. */
  DATE_PICKER_INPUT: '[data-test-id="dp-input"]',
  /** XPath: nearest ancestor that also contains a checkbox — used to scope a label to its own toggle row (see directus.ts's toggleCategoryCheckbox). */
  NEAREST_ANCESTOR_WITH_CHECKBOX: 'xpath=ancestor::*[.//*[@role="checkbox"]][1]',
  /** XPath: nearest ancestor that also contains a `<table>` — used to scope a repeating-list category section (see salemarketing.spec.ts's categorySection). */
  NEAREST_ANCESTOR_WITH_TABLE: 'xpath=ancestor::*[.//table][1]',
  /** XPath: the element immediately after this one — used to read the detail text right after a validation-error banner. */
  FOLLOWING_SIBLING_FIRST: 'xpath=following-sibling::*[1]',
} as const;

/** XPath: nearest ancestor whose own "Create New" button belongs to it — see directus.ts's subsectionContainer. */
export function nearestAncestorWithCreateNewButton(): string {
  return `xpath=ancestor::*[.//button[contains(., "${BUTTON_NAME.CREATE_NEW}")]][1]`;
}

/** A single day cell in the period-date range picker, e.g. datePickerCell('2026-07-01') -> `[data-test-id="dp-2026-07-01"]`. */
export function datePickerCell(date: string): string {
  return `[data-test-id="dp-${date}"]`;
}

/** signOut()'s account flyout sometimes needs a click on an unlabeled expand toggle before "Sign Out" is reachable — this is that toggle's position among the flyout's own (unlabeled) buttons. */
export const ACCOUNT_MENU_EXPAND_TOGGLE_INDEX = 1;

// ---------------------------------------------------------------------------
// Positional codegen selectors — salemarketing.spec.ts / solution.spec.ts
// -------------------------------------------------------------------------
// No accessible name exists for any of these widgets (unlabeled numeric
// steppers, or structural table cells inside repeating rows with no shared
// class to key off) — "position in the DOM" is genuinely the only
// identifier `npx playwright codegen` itself could produce. Centralizing
// them here doesn't make the *selector* any less positional, but it does
// mean the spec file's own code reads as a named reference instead of an
// 80-character unexplained CSS chain. See each spec's own SELECTOR NOTE doc
// comment for the full story; re-record via `npx playwright test --debug`
// if one of these ever breaks.
// ---------------------------------------------------------------------------

/** salemarketing.spec.ts's fillPLCommonCost — BW Type 2's fixed cost-breakdown table, one entry per distinct input cell touched (several are reused across more than one row/value). */
export const COMMON_COST_FIELD = {
  ROW4_FIRST_VISIBLE_INPUT:
    'div:nth-child(4) > .content > .v-form > .field.half.first-visible-field > .interface > .v-input > .input > input',
  ROW4_COL3_INPUT: 'div:nth-child(4) > .content > .v-form > div:nth-child(3) > .interface > .v-input > .input > input',
  ROW5_FIRST_VISIBLE_INPUT:
    'div:nth-child(5) > .content > .v-form > .field.half.first-visible-field > .interface > .v-input > .input > input',
  ROW5_COL3_INPUT: 'div:nth-child(5) > .content > .v-form > div:nth-child(3) > .interface > .v-input > .input > input',
  ROW6_COL3_INPUT: 'div:nth-child(6) > .content > .v-form > div:nth-child(3) > .interface > .v-input > .input > input',
  ROW5_FULL_WIDTH_TOGGLE: '.v-form.grid.with-fill > div:nth-child(5) > .content > .v-form > .field.full > .interface > div',
  FIXED_RATE_INPUT: 'div:nth-child(2) > .interface > .v-input > .input > input',
  ROW7_COL3_INPUT: 'div:nth-child(7) > .content > .v-form > div:nth-child(3) > .interface > .v-input > .input > input',
  ROW8_COL2_INPUT: 'div:nth-child(8) > .content > .v-form > div:nth-child(2) > .interface > .v-input > .input > input',
  ROW8_COL3_INPUT: 'div:nth-child(8) > .content > .v-form > div:nth-child(3) > .interface > .v-input > .input > input',
} as const;

/** salemarketing.spec.ts's setPLBwType — custom "v-menu" BW Type dropdown trigger (doesn't render into the shared #menu-outlet portal, so selectDropdownOption doesn't apply). */
export const BW_TYPE_DROPDOWN_TRIGGER =
  '.group-raw > div > div:nth-child(4) > .interface > div > .v-menu > .v-menu-activator > .v-input > .input';

/** solution.spec.ts's Solution Cost helpers. */
export const SOLUTION_COST_FIELD = {
  /** EP/Cost line item dialog's "Duration Type" dropdown trigger — same custom v-menu widget as BW_TYPE_DROPDOWN_TRIGGER. */
  DURATION_TYPE_DROPDOWN_TRIGGER: '.field.half-right > .interface > .v-menu > .v-menu-activator > .v-input > .input',
  /** The "Month(s)" option inside the shared menu portal, filtered by exact text at the call site. */
  DURATION_TYPE_OPTION_IN_MENU: '#menu-outlet div',
  /** Container scoping addSolutionCostCountryDetail's checkbox lookup to just the Solution Cost tab panel. */
  TAB_PANEL: '#tabpanel-solution_cost_tab',
  /** Per-country detail row's Country (many-to-one) picker trigger. */
  COUNTRY_PICKER_TRIGGER: '.field.half.first-visible-field > .interface > .many-to-one > .v-input > .input',
  /** Per-country detail row's Code (many-to-one) picker trigger. */
  CODE_PICKER_TRIGGER: '.field.half-right > .interface > .many-to-one > .v-input > .input',
  /** Code picker's first row in its inline results table. */
  CODE_PICKER_FIRST_ROW: '.v-table.table > table > tbody > .table-row > .spacer',
  /** Per-country detail row's "A" breakdown value input. */
  BREAKDOWN_A_INPUT: 'div:nth-child(5) > .interface > .v-input > .input > input',
  /** Per-country detail row's "B" breakdown value input. */
  BREAKDOWN_B_INPUT: 'div:nth-child(6) > .interface > .v-input > .input > input',
} as const;

/** solution.spec.ts's approval-inbox "Sort Descending" icon trigger. */
export const SORT_DESC_ICON_TRIGGER = '.align-left.actionable.sort-desc > .v-menu > .v-menu-activator > .content > .v-icon > i';

/** salemarketing.spec.ts's Period Date dual-pane calendar — the left pane's own month/year overlay toggle buttons (accessible name is "<label>-Open months/years overlay", generated by the datepicker library itself). */
export const DATE_RANGE_PICKER = {
  MONTH_OVERLAY_TOGGLE: /-Open months overlay$/,
  YEAR_OVERLAY_TOGGLE: /-Open years overlay$/,
} as const;
