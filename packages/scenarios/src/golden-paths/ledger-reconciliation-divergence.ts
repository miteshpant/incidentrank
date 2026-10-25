import type { ScenarioGoldenPath } from "./types";
import {
  EVENT_PUBLISHING_MODE_KEY,
  EXCEPTION_POLICY_KEY,
  RECONCILIATION_MODE_KEY,
} from "../ledger-reconciliation-divergence/definition";

// Derived from ledger-reconciliation-divergence/timed-events.ts:
// DIVERGENCE_ONSET_MS = 20_000
// SUSTAINED_DIVERGENCE_MS = 20_000 + 4*60_000 = 260_000
// REPAIR_WINDOW_FULLY_DRAINED_MS = 260_000 + 9*60_000 = 800_000
const SUSTAINED_DIVERGENCE_MS = 260_000;
const REPAIR_WINDOW_FULLY_DRAINED_MS = 800_000;

/**
 * Extracted from ledger-reconciliation-divergence.test.ts's "Finish from
 * the fully-reconciled path -> resolved/optimal" (safe at-least-once event
 * publishing, active exception routing, auto-repair policy, sustained) —
 * tier optimal.
 */
export const ledgerReconciliationDivergenceGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "ledger-reconciliation-divergence",
  actions: [
    {
      atMs: SUSTAINED_DIVERGENCE_MS + 1_000,
      controlKey: EVENT_PUBLISHING_MODE_KEY,
      value: "at-least-once-safe",
    },
    {
      atMs: SUSTAINED_DIVERGENCE_MS + 2_000,
      controlKey: RECONCILIATION_MODE_KEY,
      value: "active-exception-routing",
    },
    {
      atMs: SUSTAINED_DIVERGENCE_MS + 3_000,
      controlKey: EXCEPTION_POLICY_KEY,
      value: "auto-repair",
    },
  ],
  finishAtMs: REPAIR_WINDOW_FULLY_DRAINED_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
