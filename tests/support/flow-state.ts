/**
 * Cross-spec-file state hand-off for the OD/P&L approval workflow.
 *
 * create-od.spec.ts, create-pl.spec.ts, salemarketing.spec.ts,
 * solution.spec.ts, vp-salemarketing.spec.ts and vp-solution.spec.ts each
 * run as their own Playwright test file/project (see the project
 * `dependencies` chain in playwright.config.ts), so they don't share any
 * in-memory state. Every step in the workflow after the first needs to
 * search an approval inbox by the *exact* OD/P&L number created earlier
 * (per user direction: "ค้นหาจาก OD, P&L ID ที่เคยบันทึกไว้"), so the
 * numbers are persisted here as JSON and read back by later steps.
 */

import fs from 'fs';
import path from 'path';

export type FlowState = {
  reqNo?: string;
  odNo?: string;
  plNo?: string;
  // Set the moment a P&L's nested Circuit is created, cleared once that same
  // P&L's whole creation checkpoint finishes successfully. A value left set
  // means the run that created it didn't complete — create-pl.spec.ts
  // reuses it on retry instead of generating (and orphaning) another one,
  // since Circuit ID has a uniqueness constraint. See createProfitLossStatement.
  circuitId?: string;
  updatedAt?: string;
};

const FLOW_STATE_PATH = path.resolve(__dirname, '..', '..', 'reports', 'flow-state.json');

export function readFlowState(): FlowState {
  try {
    return JSON.parse(fs.readFileSync(FLOW_STATE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

/** Merges `patch` into the persisted state (existing keys are kept unless overwritten). */
export function writeFlowState(patch: FlowState): FlowState {
  const merged: FlowState = { ...readFlowState(), ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(FLOW_STATE_PATH), { recursive: true });
  fs.writeFileSync(FLOW_STATE_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

/** Reads a required key, failing with a clear message pointing at the upstream spec that should have set it. */
export function requireFlowState<K extends keyof FlowState>(key: K, producedBy: string): string {
  const value = readFlowState()[key];
  if (!value) {
    throw new Error(
      `Missing "${key}" in reports/flow-state.json. Run ${producedBy} first ` +
        `(or the whole chain: npx playwright test create-od create-pl salemarketing solution vp-salemarketing vp-solution).`
    );
  }
  return value;
}
