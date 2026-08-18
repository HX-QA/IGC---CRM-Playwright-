/**
 * Custom Playwright reporter — regenerates a single, self-contained
 * `reports/dashboard.html` every time `npx playwright test ...` finishes
 * (whether that run covered the whole chain or just one `--project`),
 * aggregating whatever checkpoint reports currently exist under
 * `reports/<slug>-report.json` (written by writeReport() in directus.ts,
 * one file per spec, overwritten on every run of that spec).
 *
 * Always the same file/path — open it once, refresh after each run.
 */
import type { Reporter } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';
import type { CheckpointResult, HistoryEntry } from './directus';

const REPORTS_DIR = path.resolve(__dirname, '..', '..', 'reports');
const DASHBOARD_PATH = path.join(REPORTS_DIR, 'dashboard.html');
const HISTORY_PATH = path.join(REPORTS_DIR, 'history.jsonl');

/** All runs ever recorded for `slug`, oldest first — see appendHistory() in directus.ts. */
function loadHistory(slug: string): HistoryEntry[] {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  return fs
    .readFileSync(HISTORY_PATH, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as HistoryEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is HistoryEntry => e !== null && e.slug === slug);
}

// Chain order + friendly titles — kept here rather than parsed out of each
// report's own Markdown so a stage that has never run yet still gets a
// "not run" placeholder card in the right place.
const STAGES: { slug: string; title: string }[] = [
  { slug: 'create-od', title: 'Create Requirement + OD' },
  { slug: 'create-pl', title: 'Create P&L' },
  { slug: 'salemarketing', title: 'Sale Marketing: OD checklist + P&L cost detail' },
  { slug: 'solution', title: 'Solution: P&L Solution Cost' },
  { slug: 'vp-salemarketing', title: 'VP Sale Marketing: Approve OD + P&L' },
  { slug: 'vp-solution', title: 'VP Solution: Approve P&L' },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusPill(status: string): string {
  const cls = status === 'PASS' ? 'pass' : status === 'FAIL' ? 'fail' : 'skip';
  return `<span class="pill ${cls}">${status}</span>`;
}

function historyRowResult(h: HistoryEntry): { cls: string; label: string } {
  if (h.failCount > 0) return { cls: 'fail', label: 'FAIL' };
  if (h.skipCount > 0 && h.passCount === 0) return { cls: 'skip', label: 'SKIP' };
  return { cls: 'pass', label: 'PASS' };
}

/**
 * Compact past-runs timeline — a `<details>` disclosure (collapsed by
 * default, so a stage with a long history doesn't bloat the page open by
 * default) listing every recorded run, most recent first. Each row is one
 * line even for a failed run (date, result, which step, truncated error) —
 * the full checkpoint table above already covers the *latest* run in
 * detail; this is for "which day did it fail, and where."
 */
function renderHistory(slug: string): string {
  const history = loadHistory(slug).slice().reverse(); // most recent first
  if (history.length <= 1) return ''; // nothing to show beyond "latest run" above

  const rows = history
    .map((h) => {
      const { cls, label } = historyRowResult(h);
      const when = new Date(h.runAt).toLocaleString();
      const failCell = h.firstFailure
        ? `Step ${h.firstFailure.step}: ${escapeHtml(h.firstFailure.name)}<div class="hist-error">${escapeHtml(h.firstFailure.error)}</div>`
        : '<span class="muted">–</span>';
      return `
        <tr>
          <td class="nowrap">${when}</td>
          <td><span class="pill ${cls}">${label}</span></td>
          <td class="nowrap">${h.passCount}/${h.passCount + h.failCount + h.skipCount}</td>
          <td>${failCell}</td>
        </tr>`;
    })
    .join('');

  return `
      <details class="history">
        <summary>Run History (${history.length} run${history.length === 1 ? '' : 's'})</summary>
        <table class="history-table">
          <thead><tr><th>When</th><th>Result</th><th>Passed</th><th>Failed at</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>`;
}

function renderStage(slug: string, title: string): string {
  const jsonPath = path.join(REPORTS_DIR, `${slug}-report.json`);
  if (!fs.existsSync(jsonPath)) {
    return `
    <section class="stage stage-empty">
      <div class="stage-head">
        <h2>${escapeHtml(title)}</h2>
        <span class="pill notrun">NOT RUN YET</span>
      </div>
      <p class="muted">No report found at <code>reports/${slug}-report.json</code>.</p>
    </section>`;
  }

  let report: CheckpointResult[] = [];
  try {
    report = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch {
    return `
    <section class="stage stage-empty">
      <div class="stage-head"><h2>${escapeHtml(title)}</h2><span class="pill fail">UNREADABLE REPORT</span></div>
    </section>`;
  }

  const runAt = fs.statSync(jsonPath).mtime.toISOString();
  const passCount = report.filter((r) => r.status === 'PASS').length;
  const failCount = report.filter((r) => r.status === 'FAIL').length;
  const skipCount = report.filter((r) => r.status === 'SKIPPED').length;
  const overall = failCount > 0 ? 'fail' : skipCount > 0 && passCount === 0 ? 'skip' : 'pass';
  const overallLabel = failCount > 0 ? 'FAILED' : skipCount > 0 && passCount === 0 ? 'SKIPPED' : 'PASSED';

  const rows = report
    .map((r) => {
      const errorRow = r.error
        ? `<tr class="error-row"><td colspan="5"><pre>${escapeHtml(r.error.trim())}</pre></td></tr>`
        : '';
      return `
        <tr class="row-${r.status.toLowerCase()}">
          <td class="num">${r.step}</td>
          <td>${escapeHtml(r.name)}</td>
          <td class="muted">${escapeHtml(r.expected)}</td>
          <td>${statusPill(r.status)}</td>
          <td class="num">${r.durationMs != null ? r.durationMs.toLocaleString() : '–'}</td>
        </tr>${errorRow}`;
    })
    .join('');

  return `
    <section class="stage">
      <div class="stage-head">
        <h2>${escapeHtml(title)} <span class="slug">(${slug})</span></h2>
        <span class="pill ${overall}">${overallLabel}</span>
      </div>
      <div class="stage-meta muted">
        Last run: ${new Date(runAt).toLocaleString()} &middot;
        ${passCount} passed, ${failCount} failed, ${skipCount} skipped
      </div>
      <table>
        <thead>
          <tr><th>#</th><th>Step</th><th>Expected result</th><th>Status</th><th>Duration (ms)</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${renderHistory(slug)}
    </section>`;
}

function buildDashboard(): string {
  const stageSections = STAGES.map((s) => renderStage(s.slug, s.title)).join('\n');

  const ran = STAGES.filter((s) => fs.existsSync(path.join(REPORTS_DIR, `${s.slug}-report.json`)));
  const anyFail = ran.some((s) => {
    const r: CheckpointResult[] = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, `${s.slug}-report.json`), 'utf-8'));
    return r.some((c) => c.status === 'FAIL');
  });
  const chainComplete = ran.length === STAGES.length;
  const overallStatus = !chainComplete ? 'partial' : anyFail ? 'fail' : 'pass';
  const overallLabel = !chainComplete
    ? `${ran.length}/${STAGES.length} STAGES RUN`
    : anyFail
      ? 'CHAIN FAILED'
      : 'CHAIN PASSED';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>IGC OD/P&amp;L Approval Flow — Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --bg: #f6f7f9; --surface: #fff; --border: #dfe3e8; --text: #1c2128; --muted: #6b7280;
    --pass-bg: #e6f6ec; --pass-fg: #1a7f37; --fail-bg: #fdeaea; --fail-fg: #cf222e;
    --skip-bg: #fff8e6; --skip-fg: #9a6700; --notrun-bg: #eef0f2; --notrun-fg: #6b7280;
    --accent: #2563eb;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 64px; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 1000px; margin: 0 auto; }
  header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
  h1 { font-size: 22px; margin: 0; }
  .generated { color: var(--muted); font-size: 13px; }
  .overall-bar {
    display: flex; align-items: center; gap: 10px; margin: 16px 0 28px;
    padding: 14px 18px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface);
  }
  .stage { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; margin-bottom: 18px; }
  .stage-empty { opacity: 0.6; }
  .stage-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .stage-head h2 { font-size: 16px; margin: 0; }
  .slug { color: var(--muted); font-weight: 400; font-size: 13px; }
  .stage-meta { font-size: 13px; margin: 6px 0 14px; }
  .muted { color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .row-fail td { background: #fff5f5; }
  .error-row pre {
    margin: 0; padding: 10px 12px; background: #2b2b2b; color: #f2b8b8; border-radius: 6px;
    font-size: 12px; white-space: pre-wrap; overflow-x: auto;
  }
  .pill {
    display: inline-block; padding: 3px 10px; border-radius: 100px; font-size: 11.5px;
    font-weight: 700; letter-spacing: 0.03em;
  }
  .pill.pass { background: var(--pass-bg); color: var(--pass-fg); }
  .pill.fail { background: var(--fail-bg); color: var(--fail-fg); }
  .pill.skip { background: var(--skip-bg); color: var(--skip-fg); }
  .pill.notrun { background: var(--notrun-bg); color: var(--notrun-fg); }
  .pill.partial { background: var(--skip-bg); color: var(--skip-fg); }
  .overall-bar .pill { font-size: 13px; padding: 5px 14px; }
  details.history { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px; }
  details.history summary {
    cursor: pointer; font-size: 13px; font-weight: 600; color: var(--accent);
    list-style: none;
  }
  details.history summary::-webkit-details-marker { display: none; }
  details.history summary::before { content: "▸ "; }
  details.history[open] summary::before { content: "▾ "; }
  .history-table { margin-top: 10px; }
  .history-table th, .history-table td { font-size: 12.5px; }
  td.nowrap { white-space: nowrap; }
  .hist-error {
    color: var(--muted); font-size: 11.5px; margin-top: 2px; font-family: ui-monospace, Menlo, monospace;
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>IGC OD/P&amp;L Approval Flow — Test Dashboard</h1>
      <span class="generated">Generated ${new Date().toLocaleString()}</span>
    </header>
    <div class="overall-bar">
      <span class="pill ${overallStatus}">${overallLabel}</span>
      <span class="muted">create-od &rarr; create-pl &rarr; salemarketing &rarr; solution &rarr; vp-salemarketing &rarr; vp-solution</span>
    </div>
    ${stageSections}
  </div>
</body>
</html>`;
}

export default class DashboardReporter implements Reporter {
  onEnd() {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(DASHBOARD_PATH, buildDashboard());
    console.log(`\nDashboard updated: reports/dashboard.html\n`);
  }
}
