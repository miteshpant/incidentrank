import type { ScenarioGoldenPath } from "./types";
import {
  ADMISSION_CONTROL_KEY,
  ASYNC_DEFERRAL_KEY,
  CACHE_STRATEGY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  OPTIONAL_FEATURE_DISABLE_KEY,
  TRAFFIC_CLASS_PRIORITY_KEY,
} from "../capacity-exhaustion-during-peak-event/definition";

const PEAK_EVENT_ONSET_MS = 20_000;
const SUSTAINED_PEAK_MS = PEAK_EVENT_ONSET_MS + 4 * 60_000;
const QUEUE_DRAIN_FULLY_DONE_MS = SUSTAINED_PEAK_MS + 3 * 60_000 + 30_000;

/**
 * Extracted from capacity-exhaustion-during-peak-event.test.ts's "optimal
 * path (strategy A) scores near-maximum with full dataIntegrity credit"
 * (STRATEGY_A_ACTIONS) — this scenario has an authored acceptableCondition
 * (safe-degraded-protected), and strategy A is confirmed to reach the
 * "strategy-a-optimal" state with tier "optimal" via
 * evaluateCompletionEligibility in the adjacent sequencing tests.
 */
export const capacityExhaustionDuringPeakEventGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "capacity-exhaustion-during-peak-event",
  actions: [
    { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
    { atMs: SUSTAINED_PEAK_MS + 2_000, controlKey: ADMISSION_CONTROL_KEY, value: "protect-critical" },
    { atMs: SUSTAINED_PEAK_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
    { atMs: SUSTAINED_PEAK_MS + 4_000, controlKey: OPTIONAL_FEATURE_DISABLE_KEY, value: "disabled" },
    { atMs: SUSTAINED_PEAK_MS + 5_000, controlKey: CACHE_STRATEGY_KEY, value: "extended-ttl" },
    { atMs: SUSTAINED_PEAK_MS + 6_000, controlKey: ASYNC_DEFERRAL_KEY, value: "defer-to-queue" },
  ],
  finishAtMs: QUEUE_DRAIN_FULLY_DONE_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
