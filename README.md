# IGC Automation Tests

Playwright end-to-end test suite for the IGC CRM Platform (Directus admin)
Requirement → OD → P&L approval workflow.

> ชุดทดสอบอัตโนมัติ (Playwright) สำหรับ flow การอนุมัติ Requirement → OD → P&L
> บนระบบ IGC CRM Platform (Directus admin)

## What this covers

A single mock **Requirement** flows through six roles, each its own spec file
and Playwright project, chained via `dependencies` in
[playwright.config.ts](playwright.config.ts) so running the last one runs
every stage before it in order:

> Requirement (จำลอง) 1 ตัวจะไหลผ่าน 6 role ตามลำดับ แต่ละ role คือ spec
> file/project แยกกัน แต่เชื่อมกันด้วย `dependencies` ใน
> [playwright.config.ts](playwright.config.ts) — รัน project สุดท้ายจะไล่รัน
> ทุก stage ก่อนหน้าให้ครบตามลำดับอัตโนมัติ

```
create-od → create-pl → salemarketing → solution → vp-salemarketing → vp-solution
```

| Stage | Role | What it does | ทำอะไร (ไทย) |
|---|---|---|---|
| `create-od` | Sale Marketing | Creates a Requirement + Opportunity Decision (OD) with mock data | สร้าง Requirement + OD ด้วยข้อมูลจำลอง |
| `create-pl` | Sale Marketing | Adds a Profit & Loss Statement (P&L) to that Requirement | เพิ่ม P&L เข้าไปใน Requirement เดิม |
| `salemarketing` | Sale Marketing | Submits the OD's Marketing Dept. checklist, fills P&L cost detail, saves to *Waiting for initiation* | ส่ง checklist แผนก Marketing ของ OD, กรอกรายละเอียดต้นทุน P&L, บันทึกจนสถานะเป็น *Waiting for initiation* |
| `solution` | Solution | Fills P&L Solution Cost, saves to *Initiated / Waiting for approve* | กรอก Solution Cost ของ P&L, บันทึกจนสถานะเป็น *Initiated / Waiting for approve* |
| `vp-salemarketing` | VP Sale Marketing | Approves the OD and the P&L | อนุมัติ OD และ P&L |
| `vp-solution` | VP Solution | Final P&L approval | อนุมัติ P&L รอบสุดท้าย |

State (`reqNo`/`odNo`/`plNo`) hands off between stages via
`reports/flow-state.json` — see [tests/support/flow-state.ts](tests/support/flow-state.ts).

> ข้อมูลอ้างอิง (`reqNo`/`odNo`/`plNo`) ถูกส่งต่อระหว่าง stage ผ่านไฟล์
> `reports/flow-state.json` — ดูรายละเอียดที่
> [tests/support/flow-state.ts](tests/support/flow-state.ts)

`tests/cleanup-mock-requirements.spec.ts` is a standalone maintenance
utility (not part of the chain) for deleting mock Requirements left behind
by repeated `create-od` runs.

> `tests/cleanup-mock-requirements.spec.ts` เป็นเครื่องมือแยกต่างหาก
> (ไม่ได้อยู่ใน chain หลัก) ใช้สำหรับลบ Requirement จำลองที่ตกค้างจากการรัน
> `create-od` ซ้ำๆ

## Setup

```bash
npm install
npx playwright install chromium
cp .env.dev.example .env.dev   # fill in credentials for each role
```

> ติดตั้ง dependency, ติดตั้ง browser ของ Playwright แล้ว copy ไฟล์ env
> ตัวอย่างมากรอก credentials ของแต่ละ role เอง

See [.env.dev.example](.env.dev.example) for the full list of required
variables (one email/password pair per role, plus the relational-picker
values — Customer Name, Salesperson, Requestor — that must match real
records in the target environment).

> ดู field ที่ต้องกรอกทั้งหมดได้ที่ [.env.dev.example](.env.dev.example)
> (email/password ของแต่ละ role + ค่าที่ใช้เลือกใน relational picker เช่น
> Customer Name/Salesperson/Requestor ซึ่งต้องตรงกับข้อมูลจริงที่มีอยู่ใน
> environment นั้นๆ)

## Running

```bash
# Full chain, headless
npm run test:regression

# Full chain, headed (watch it run)
npm run test:regression:headed

# Open the last HTML report
npm run test:regression:report

# One stage only (its dependencies still run first)
npx playwright test --project=salemarketing --headed

# One stage only, skip dependencies (reuse whatever's already in flow-state.json)
npx playwright test --project=salemarketing --headed --no-deps

# Against production instead of dev
TEST_ENV=production npx playwright test --project=vp-solution
```

> - `test:regression` = รันทั้ง chain แบบ headless
> - `test:regression:headed` = รันทั้ง chain แบบเห็นหน้าจอเบราว์เซอร์
> - `test:regression:report` = เปิด HTML report ล่าสุด
> - `--project=<stage>` = รันเฉพาะ stage เดียว (แต่ยังรัน dependency ก่อนหน้าให้ด้วย)
> - เพิ่ม `--no-deps` = รันเฉพาะ stage นั้นจริงๆ ไม่รันตัวก่อนหน้า (ใช้ข้อมูลเดิมจาก flow-state.json)
> - `TEST_ENV=production` = รันกับ environment production แทน dev

Each spec writes a plain-language pass/fail report to
`reports/<slug>-report.{md,json,txt}` in addition to the standard Playwright
HTML report.

> แต่ละ spec จะเขียนรายงานผ่าน/ไม่ผ่านแบบอ่านง่ายไว้ที่
> `reports/<slug>-report.{md,json,txt}` เพิ่มเติมจาก HTML report ปกติของ Playwright

### Dashboard

`reports/dashboard.html` is one fixed file that a custom reporter
([tests/support/dashboard-reporter.ts](tests/support/dashboard-reporter.ts))
regenerates at the end of every `npx playwright test ...` run, aggregating
every stage's checkpoint report (whichever ones exist so far) into one page
— open it once and just refresh after each run to see every step, pass or
fail, across the whole chain. A stage that hasn't run yet shows as "NOT RUN
YET" instead of being left out.

> `reports/dashboard.html` คือไฟล์เดียวที่ regenerate ทุกครั้งที่รัน
> `npx playwright test` (ไม่ว่าจะรันทั้ง chain หรือแค่ stage เดียว) รวมผลผ่าน/
> ไม่ผ่านของทุก checkpoint จากทุก stage ไว้ในหน้าเดียว — เปิดทิ้งไว้แล้ว
> refresh ดูใหม่ได้ทุกครั้งหลังรัน stage ที่ยังไม่เคยรันจะโชว์ "NOT RUN YET"

⚠️ **`--reporter=list` (or any other `--reporter=` CLI flag) replaces the
reporters configured in `playwright.config.ts` entirely** — including this
one. Omit `--reporter=` (or pass `--reporter=list,./tests/support/dashboard-reporter.ts`)
if you want the dashboard to update.

> ⚠️ ถ้าใส่ `--reporter=list` (หรือ `--reporter=` อะไรก็ตาม) ตอนรัน จะทับ
> reporter ที่ตั้งไว้ใน `playwright.config.ts` ทั้งหมด **รวมถึง dashboard
> ตัวนี้ด้วย** — ถ้าอยากให้ dashboard อัปเดต อย่าใส่ `--reporter=` เอง
> (หรือใส่ `--reporter=list,./tests/support/dashboard-reporter.ts` แทน)

#### Run History

Every run also appends one compact line to `reports/history.jsonl`
(slug, timestamp, pass/fail/skip counts, and — if it failed — the first
failed step's name and a truncated error) via `appendHistory()` in
[tests/support/directus.ts](tests/support/directus.ts). Once a stage has
run more than once, its card on the dashboard gets a collapsed "▸ Run
History (N runs)" disclosure listing every past run for that stage,
newest first, so you can answer "which day did this fail, and at which
step?" without digging through old HTML reports. The log is a single
file, capped at the last 300 runs (oldest lines are trimmed off), so it
stays useful across months of runs without turning into one file per
run.

> ทุกครั้งที่รันจะเขียนเพิ่มไว้ที่ `reports/history.jsonl` หนึ่งบรรทัดต่อการ
> รัน (slug, เวลา, จำนวนผ่าน/ไม่ผ่าน/skip และถ้า fail จะเก็บชื่อ step แรกที่
> fail กับ error แบบตัดสั้นไว้ด้วย) ผ่านฟังก์ชัน `appendHistory()` ใน
> [tests/support/directus.ts](tests/support/directus.ts) — พอ stage ไหนเคย
> รันมากกว่า 1 ครั้ง การ์ดของ stage นั้นบน dashboard จะมีช่อง "▸ Run History
> (N runs)" ที่กดขยายดูได้ แสดงประวัติการรันทุกครั้งของ stage นั้น
> (ล่าสุดอยู่บนสุด) ทำให้ตอบได้ว่า "วันไหน fail ตอนไหน" โดยไม่ต้องไปไล่เปิด
> HTML report เก่าๆ ทีละไฟล์ — ไฟล์นี้มีไฟล์เดียว และจำกัดไว้ที่ 300 รันล่าสุด
> (รันเก่ากว่านั้นจะถูกตัดออกอัตโนมัติ) เพื่อไม่ให้กินพื้นที่เพิ่มขึ้นเรื่อยๆ
> แม้จะรันไปหลายเดือนก็ตาม

### Cleanup utility

Dry-run by default — lists mock Requirements without deleting anything:

```bash
npm run cleanup:dry-run
CONFIRM_CLEANUP=yes npm run cleanup:confirm   # actually deletes them
```

> ค่าเริ่มต้นคือ dry-run (แค่แสดงรายชื่อ Requirement จำลอง ไม่ลบจริง)
> ต้องใส่ `CONFIRM_CLEANUP=yes` เท่านั้นถึงจะลบจริง — **ระวัง เป็นการลบแบบกู้คืนไม่ได้**

## Project structure

```
tests/
  auth.setup.ts                    # logs in once as "salemarketing", saves session for reuse
  create-od.spec.ts                # stage 1
  create-pl.spec.ts                # stage 2
  salemarketing.spec.ts            # stage 3
  solution.spec.ts                 # stage 4
  vp-salemarketing.spec.ts         # stage 5
  vp-solution.spec.ts              # stage 6
  cleanup-mock-requirements.spec.ts
  support/
    directus.ts                    # shared helpers: login, field lookups, save/report plumbing
    locators.ts                    # named UI element identifiers — see "Locators config" below
    flow-state.ts                  # cross-spec reqNo/odNo/plNo/circuitId handoff
    dashboard-reporter.ts          # regenerates reports/dashboard.html every run
```

### Locators config

Every raw string that used to go straight into a `page.getByRole(...)` /
`getByText(...)` / `page.locator(...)` call (e.g. `{ name: 'check' }` for a
Save button, `'account_circle'` for the account menu, `'order_approve OD'`
for a nav link) now has a descriptive name, defined once in
[tests/support/locators.ts](tests/support/locators.ts) and grouped by kind
(`BUTTON_NAME`, `LINK_NAME`, `CHECKBOX_NAME`, `TEXT`, `SELECTOR`, ...). Every
helper in `directus.ts` and every spec file imports from there instead of
writing the raw literal inline — so a call site reads
`getByRole('button', { name: BUTTON_NAME.SAVE, exact: true })` instead of
`getByRole('button', { name: 'check', exact: true })`. If a selector ever
breaks, re-record it with `npx playwright test --debug` or `npx playwright
codegen` and update the value in `locators.ts` — every caller picks up the
fix automatically.

> เดิมโค้ดจะเขียน string ดิบๆ ตรงเข้าไปใน `page.getByRole(...)` /
> `getByText(...)` / `page.locator(...)` เลย (เช่น `{ name: 'check' }`
> สำหรับปุ่ม Save, `'account_circle'` สำหรับเมนูบัญชี, `'order_approve OD'`
> สำหรับลิงก์เมนู) ซึ่งอ่านแล้วงงถ้าไม่รู้จัก UI ตัวนี้มาก่อน ตอนนี้ทุก
> string แบบนี้ถูกตั้งชื่อไว้ที่เดียวใน
> [tests/support/locators.ts](tests/support/locators.ts) แบ่งเป็นกลุ่มตาม
> ประเภท (`BUTTON_NAME`, `LINK_NAME`, `CHECKBOX_NAME`, `TEXT`, `SELECTOR`,
> ...) แล้วทุก helper ใน `directus.ts` และทุกไฟล์ spec import มาใช้แทนการ
> เขียน string ดิบตรงๆ — โค้ดจึงอ่านว่า `getByRole('button', { name:
> BUTTON_NAME.SAVE, exact: true })` แทนที่จะเป็น `getByRole('button', {
> name: 'check', exact: true })` ถ้า selector ไหนพังในอนาคต ให้ re-record
> ด้วย `npx playwright test --debug` หรือ `npx playwright codegen` แล้วแก้
> ค่าใน `locators.ts` ที่เดียว ทุกจุดที่เรียกใช้จะได้ค่าที่แก้แล้วทันที

CI runs the full suite on push/PR to `main`/`master` via
[.github/workflows/playwright.yml](.github/workflows/playwright.yml).

## Recent fixes (this pass)

- **Additional Cost/Income wrote to the wrong item** — once both categories
  are enabled the page has two identically-named "add" buttons; an
  unscoped `.first()` always hit the Cost button. Now scoped per-category
  by the presence of that category's own `<table>`.
  > *กดปุ่ม "add" ผิดฝั่ง — พอเปิดทั้ง Cost และ Income พร้อมกัน หน้ามีปุ่ม
  > "add" ชื่อซ้ำกัน 2 ปุ่ม เดิมใช้ `.first()` แบบไม่ scope เลยโดนปุ่ม Cost
  > ตลอด ตอนนี้ scope ตามตาราง (`<table>`) ของแต่ละ category แล้ว*
- **Session reuse for the Sale Marketing chain** — `create-od` →
  `create-pl` → `salemarketing` run as the same user back to back but each
  did a full fresh login. A setup project (`auth.setup.ts`) now logs in
  once and saves `storageState`; the three specs load it via
  `ensureLoggedIn()`.
  > *เพิ่มการใช้ session ซ้ำสำหรับ user เดิม — 3 stage นี้เป็น user เดียวกัน
  > ติดกันแต่ login ใหม่ทุกครั้ง ตอนนี้ login ครั้งเดียวผ่าน `auth.setup.ts`
  > แล้วเก็บ session ไว้ใช้ต่อ*
- **Session-reuse race + refresh-token rotation** — checking `page.url()`
  right after `goto()` raced Directus's optimistic render, so a dead
  session could read as "signed in." Directus also rotates the refresh
  token on use, so a session snapshot taken once at setup went stale as
  soon as any consumer auto-refreshed. Fixed by waiting for a real
  signed-in marker and re-saving `storageState` after every consuming spec.
  > *บั๊กที่เจอตอนทำ session reuse — เช็ค URL เร็วเกินไปทำให้คิดว่า
  > login สำเร็จทั้งที่ session ตายไปแล้ว, และ refresh token ของ Directus
  > จะหมุนทุกครั้งที่ใช้ ทำให้ session ที่บันทึกไว้ครั้งแรกหมดอายุเร็วกว่าที่คิด
  > แก้โดยรอสัญญาณ login จริงๆ และบันทึก session ใหม่ทุกครั้งหลังใช้*
- **Retry no longer orphans a Requirement** — a run that fails after
  creating the Requirement but before finishing its OD now reopens and
  reuses that same Requirement on retry instead of creating another one.
  > *retry แล้วไม่สร้าง Requirement ซ้ำอีก — ถ้ารอบก่อนสร้าง Requirement
  > สำเร็จแต่ตาย OD ยังไม่เสร็จ รอบถัดไปจะเปิด Requirement ตัวเดิมมาใช้ต่อ
  > ไม่สร้างใหม่*
- **`solution.spec.ts` couldn't open at all** — `login()` only checked that
  the URL left `/login`, not where it landed (some accounts redirect
  elsewhere); the sidebar's Approval section starts collapsed with no
  OD/P&L links in the DOM until expanded; the approval-inbox search is
  debounced client-side and `networkidle` doesn't wait for the filtered
  rows to render. All three fixed in `directus.ts`.
  > *`solution.spec.ts` เปิดไม่ได้เลยตั้งแต่ต้น — เจอ 3 บั๊กซ้อนกัน: login
  > เช็คแค่ว่าออกจากหน้า login แต่ไม่เช็คว่าไปหน้าไหน, เมนู Approval ใน
  > sidebar ปกติจะพับอยู่ต้องกด expand ก่อน, และช่องค้นหาใน approval inbox
  > มีการหน่วงเวลา (debounce) ที่โค้ดเดิมไม่ได้รอ*
- **"Save and Stay" wasn't actually checked** — this checkpoint never
  called `expectNoValidationError()`, so a silently-rejected save looked
  identical to a successful one.
  > *checkpoint "Save and Stay" ไม่เคยเช็ค validation error เลย ทำให้ save
  > ที่ถูก reject แบบเงียบๆ ดูเหมือนสำเร็จ*
- **Circuit ID uniqueness** — the P&L's "Circuits" section allows "No
  items" when the nested item is created, but Directus only rejects a
  missing/duplicate `circuit_id` when the outer Requirement is saved.
  `createProfitLossStatement()` now creates one Circuit with a per-run
  unique ID, idempotently (skips creation if the P&L already has one).
  > *ปัญหา circuit_id ซ้ำ — ตอนสร้าง P&L ปล่อย Circuits ว่างได้ แต่ Directus
  > จะเช็ค uniqueness ตอน save Requirement เท่านั้น ตอนนี้สร้าง Circuit
  > ให้อัตโนมัติด้วยรหัสที่ไม่ซ้ำในแต่ละรอบ และเช็คก่อนว่ามีอยู่แล้วหรือยัง
  > ก่อนจะสร้างใหม่*
- **A mis-clicked button was silently duplicating the Circuit** — an
  unscoped, page-wide positional "confirm" click in
  `setPLBwTypeAndProjectCode` actually landed on Circuits' own "Create New"
  button, and the very next line then typed a hardcoded literal
  (`ID-HX-AUT001`) into the Circuit ID field it had just opened. That fixed
  string, reused by every run, collided with historical duplicates —
  which is what the recurring "circuit_id: Value has to be unique" failure
  at the final save was actually about. There is no real "Project Code"
  field on this P&L; the step was renamed `setPLBwType` and no longer
  touches Circuits at all.
  > *เจอสาเหตุจริงของ circuit ซ้ำ — ปุ่ม "confirm" ใน
  > `setPLBwTypeAndProjectCode` ที่ไม่ได้ scope ดันไปกดปุ่ม "Create New"
  > ของ Circuits โดยไม่ตั้งใจ แล้วกรอกค่าคงที่ `ID-HX-AUT001` ลงไปในนั้น
  > ค่าคงที่นี้ถูกใช้ซ้ำทุกรอบมานานจนชนกับของเก่าที่มีอยู่แล้ว — field
  > "Project Code" จริงๆไม่มีอยู่บน P&L เลย จึงลบส่วนนี้ทิ้งและเปลี่ยนชื่อ
  > ฟังก์ชันเป็น `setPLBwType`*
- **Dual-pane calendar navigation** — the Period Date picker shows two
  months side by side; the code assumed the target month was already
  visible and only tracked month (not year). Rewritten to navigate both
  month and year from the first pane's own reading.
  > *ปฏิทินเลือกวันที่แสดง 2 เดือนพร้อมกัน (dual-pane) โค้ดเดิมสมมติว่า
  > เดือนปลายทางโชว์อยู่แล้วและตามแค่เดือนไม่ตามปี ตอนนี้ navigate ทั้ง
  > เดือนและปีให้ถูกต้อง*
- **Same debounced-search bug, second location** — the Salesperson
  relational picker had the identical fill → `networkidle` → click gap as
  the approval-inbox search. Now waits for the searched-for row to render.
  > *เจอบั๊ก debounced-search แบบเดียวกันอีกจุดที่ Salesperson picker
  > แก้ด้วยวิธีเดียวกันคือรอให้ผลลัพธ์ค้นหาขึ้นมาจริงก่อนคลิก*
- **`vp-salemarketing.spec.ts`**: OD approval-inbox row was matched by
  customer name (ambiguous across a real inbox — 22 matches observed);
  switched to matching by the unique OD number. The Marketing/PM Department
  sections are collapsed accordions where the label text isn't itself the
  clickable element — clicking it directly didn't expand the section.
  > *`vp-salemarketing.spec.ts` — เดิมหา row ใน approval inbox ด้วยชื่อ
  > ลูกค้า (ชนกับ row อื่นที่ลูกค้าเดียวกัน เจอ 22 แถว) เปลี่ยนไปหาด้วยเลข OD
  > ที่ไม่ซ้ำแทน และ section Marketing/PM Department เป็น accordion ที่พับอยู่
  > ต้องคลิกตัว wrapper ไม่ใช่ตัวข้อความถึงจะขยายออก*
- **The "Approve" control never existed** — checked every button's
  accessible name live: there is no "Approve" button anywhere on the OD
  approval-inbox view. Marketing Department is pure data entry; PM
  Department's decision points are labeled "Accepted"/"Not accepted", not
  "Approve". Removed both bogus `radio_button_unchecked Approve` clicks,
  plus a redundant labeled click that could never match once its own
  positional click already flipped the same radio to "checked".
  > *ปุ่ม "Approve" ไม่มีอยู่จริงในหน้านี้เลย (เช็คทุกปุ่มบนหน้าจอสดแล้ว) —
  > Marketing Department เป็น data entry ล้วนๆ ส่วน PM Department ใช้คำว่า
  > "Accepted"/"Not accepted" ไม่ใช่ "Approve" ลบทั้งปุ่ม Approve ปลอมและปุ่ม
  > กดซ้ำที่พังเพราะ state เปลี่ยนไปแล้วออก*
- **Stale-index checkbox loop** — how many "indeterminate_check_box"
  checklist toggles appear varies run to run (0–2, one per department with
  an outstanding document requirement). `.all()` snapshots each match's
  index via `nth()` up front; clicking one can re-render and shrink the
  set, leaving a later `nth()` waiting forever for an index that no longer
  exists. Rewritten as a `while (count() > 0) { first().click() }` loop
  that re-queries fresh every iteration.
  > *checklist ที่ต้องติ๊กมีจำนวนไม่แน่นอน (0-2 อัน ต่อรอบ) โค้ดเดิมใช้
  > `.all()` ซึ่ง snapshot index ไว้ล่วงหน้า พอกดอันแรกแล้ว DOM เปลี่ยน
  > ทำให้อันที่สองรอ index ที่ไม่มีอยู่จริงค้างตลอดไป แก้เป็น loop ที่ query
  > ใหม่ทุกรอบแทน*
- **Two required fields were never filled** — "Customer Business Type"
  (a starred Product/Service/Rental checkbox group in Marketing Department)
  and "Ref. Contact No." (in PM Department's own "Document for Decision",
  disabled until its neighboring "BOQ.SD Job." toggle is switched on) both
  failed "Value can't be null" at save time. Neither was ever touched by
  the original flow. Now checks "Product" and toggles+fills the reference
  number.
  > *มี required field 2 ตัวที่ไม่เคยถูกกรอกเลย — "Customer Business Type"
  > (checkbox group Product/Service/Rental ใน Marketing Department) และ
  > "Ref. Contact No." (ใน PM Department ซึ่งถูก disable ไว้จนกว่าจะเปิด
  > toggle "BOQ.SD Job." ก่อน) ทำให้ save ไม่ผ่านด้วย "Value can't be null"
  > ตอนนี้กรอกทั้งสองจุดแล้ว*
- **`solution.spec.ts` / `vp-solution.spec.ts`: same page-wide status-cell
  bug, twice more** — both specs clicked the first cell matching a status
  placeholder ("Waiting for initiation" / "--") page-wide instead of
  scoping to the row for the saved P&L number, breaking the instant more
  than one row shared that status (6 and 29 matches observed
  respectively). Both now scope by `getByRole('row', { name: plNo })`.
  > *`solution.spec.ts` และ `vp-solution.spec.ts` มีบั๊กเดียวกันอีก 2 จุด —
  > คลิก cell สถานะตัวแรกที่เจอแบบไม่ scope ตาม P&L ทำให้พังทันทีที่มีมากกว่า
  > 1 แถวสถานะเดียวกัน (เจอ 6 และ 29 แถวตามลำดับ) แก้ให้ scope ด้วยเลข P&L
  > แทน*
- **"Product" checkbox disabled for longer than a permission-check race**
  — the same required checkbox from the item above rendered disabled for
  15s+ in some runs but was instantly enabled in others. Likely a
  reactive-update lag between the requester's checklist submission (a
  *different* view) and this approval-inbox view picking up the resulting
  permission change. Now reloads and re-expands Marketing Department up
  to 3 times before giving up, instead of failing on the first stale read.
  > *checkbox "Product" ที่ต้องกรอก บางรอบ disabled ค้างนานกว่า 15 วินาที
  > บางรอบ enable ทันที (น่าจะเป็น lag ของการ sync สถานะระหว่าง view ที่
  > requester submit checklist กับ view นี้) ตอนนี้ reload และเปิด Marketing
  > Department ใหม่ซ้ำได้ถึง 3 ครั้งก่อนจะยอมแพ้*
- **Sign Out flaky right after "3.2 Approve P&L"** — same "dispatches,
  doesn't wait" gap as every other Save-and-Stay in this suite: this save
  had no settle wait, so Sign Out's own navigation raced it and got stuck
  fighting a recurring "Keep Editing" prompt. Fixed the same way.
  > *Sign Out หลุดบ่อยหลังขั้น "3.2 Approve P&L" — เป็นช่องโหว่แบบเดียวกับ
  > Save-and-Stay จุดอื่นๆในชุดนี้ (dispatch แล้วไม่รอ settle) แก้ด้วยวิธี
  > เดียวกัน*
- **Cleanup script's delete confirmation** — assumed a `role="dialog"`
  wrapper around the confirm prompt that doesn't exist, so the delete
  never actually ran (safe failure — nothing was deleted). Rewired to
  match the prompt by its own text.
  > *ปุ่มยืนยันลบใน cleanup script เดิมหา element แบบ `role="dialog"` ซึ่ง
  > ไม่มีจริง ทำให้ลบไม่เคยสำเร็จเลย (ปลอดภัย ไม่มีอะไรถูกลบผิด) แก้ให้หา
  > จากข้อความของ prompt แทน*

**Result: the full chain (`create-od` → `create-pl` → `salemarketing` →
`solution` → `vp-salemarketing` → `vp-solution`) now passes end to end for
the first time.**
> *ผลลัพธ์: ตอนนี้ chain ทั้งหมดตั้งแต่ `create-od` ถึง `vp-solution` รันผ่าน
> ครบทุก stage แบบต่อเนื่องเป็นครั้งแรก*

### Known open items

- `DELETE /items/requirements` returns `500 INTERNAL_SERVER_ERROR` for any
  Requirement that still has nested OD/P&L/Circuit records — i.e. every
  mock Requirement this suite creates. This is a backend/API issue, not a
  test bug; the cleanup script can't work around it from the UI.
  > *ลบ Requirement ที่มี OD/P&L/Circuit ผูกอยู่ไม่ได้ (server ตอบ 500) —
  > เป็นปัญหาฝั่ง backend/API ไม่ใช่บั๊กของ test script แก้จากฝั่ง UI ไม่ได้*
- Row-lookup timeouts (`getByRole('row', { name: ... }).first()...` not
  resolving in time) surface occasionally when creating a fresh
  Requirement, most likely because the shared dev database has accumulated
  a large number of mock Requirements from repeated test runs — see the
  backend delete issue above, which is what's currently blocking cleanup.
  Simply retrying the run has always succeeded so far.
  > *บางครั้งเจอ timeout ตอนหา row ของ Requirement ที่เพิ่งสร้าง น่าจะเป็น
  > เพราะฐานข้อมูล dev สะสม mock Requirement ไว้เยอะจากการรันทดสอบซ้ำๆ (ดู
  > ปัญหา backend delete ด้านบน ซึ่งเป็นสาเหตุที่ cleanup ยังทำไม่ได้) แค่
  > ลองรันใหม่ก็ผ่านทุกครั้งที่เจอจนถึงตอนนี้*
