import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { APP_ROLLOUT_PERCENT_KEY, BACKFILL_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "compatibility-broken-baseline": 240,
  "compatibility-broken-escalated": 380,
  "aggressive-rollout-continues-while-broken": 320,
  "aggressive-rollout-continues-while-broken-escalated": 480,
  "compatibility-broken-unmanaged": 400,
  "unsafe-sequence-rollback-before-repair-early": 90,
  "unsafe-sequence-rollback-before-repair-sustained": 110,
  "unsafe-sequence-rollback-new-shape-only": 110,
  "unsafe-contract-before-backfill": 150,
  "unsafe-contract-before-backfill-sustained": 190,
  "backfill-high-lock-contention-normal-timeout": 160,
  "backfill-high-lock-contention-normal-timeout-bounded": 120,
  "backfill-high-lock-contention-aggressive-retries": 260,
  "backfill-high-lock-contention-aggressive-retries-bounded": 210,
  "backfill-high-extended-timeout-absorbs-pressure": 70,
  "draining-early-low-concurrency": 50,
  "frozen-dual-shape-no-backfill": 60,
  "draining-bounded-low-concurrency": 30,
  "draining-bounded-high-concurrency": 55,
  "fully-repaired-safe-rollback": 0,
  "fully-repaired-safe-forward-complete": 0,
  "fully-repaired-undeclared": 10,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_900,
  perUnitMonthlyUsd: {
    [`${BACKFILL_CONCURRENCY_KEY}:high`]: 220,
    [`${BACKFILL_CONCURRENCY_KEY}:low`]: 60,
    [`${APP_ROLLOUT_PERCENT_KEY}:100`]: 90,
  },
};

/**
 * Full recovery (OPTIMAL): the historical new-shape-only backlog has
 * fully drained to zero, neither hard correctness violation (unreadable
 * read, discarded acknowledged write) has ever occurred, and a single
 * fleet mode has been safely declared (compatibilityStatus === "safe").
 * Only reachable via backfillWindowElapsed AND a control combination
 * that actually ran backfill the whole window with dual-shape writes
 * active — a candidate who left compatibilityWriteMode on
 * "legacy-shape", or who rolled back before backfill ran, or who
 * contracted early, never reaches these numbers no matter how much
 * simulated time passes.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "newShapeOnlyRowCount", operator: "equals", comparedTo: 0 },
    { key: "unreadableByServingFleetCount", operator: "equals", comparedTo: 0 },
    { key: "discardedAcknowledgedWriteCount", operator: "equals", comparedTo: 0 },
    { key: "lockTimeoutFailureCount", operator: "equals", comparedTo: 0 },
    { key: "compatibilityStatus", operator: "equals", comparedTo: "safe" },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: no hard correctness violation has ever occurred
 * (zero unreadable reads, zero discarded writes), new incompatible rows
 * have genuinely stopped accumulating (compatibilityStatus ===
 * "contained" — only reachable once compatibilityWriteMode has left
 * "legacy-shape"), and the historical backlog, while still nonzero, is
 * BOUNDED and demonstrably draining (newShapeOnlyRowCount strictly below
 * the frozen-no-backfill ceiling of 300, reflecting backfill actually
 * running) rather than frozen or still growing. Additionally requires
 * lockTimeoutFailureCount === 0: a bounded-but-draining backlog paired
 * with normal (short) lock timeout under high-concurrency backfill is
 * STILL actively dropping live customer writes outright (see rules.ts's
 * "-bounded" lock-contention variants) — that live-traffic damage is
 * real and ongoing, so it must never qualify as a safe handback state
 * merely because the historical row-shape backlog itself is bounded.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "unreadableByServingFleetCount", operator: "equals", comparedTo: 0 },
    { key: "discardedAcknowledgedWriteCount", operator: "equals", comparedTo: 0 },
    { key: "lockTimeoutFailureCount", operator: "equals", comparedTo: 0 },
    { key: "compatibilityStatus", operator: "equals", comparedTo: "contained" },
    { key: "newShapeOnlyRowCount", operator: "less_than_or_equal", comparedTo: 100 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: unreadable-by-serving-fleet reads have reached a scale that
 * represents genuine, severe, unrecoverable-on-a-reasonable-timeline
 * damage — a sustained, large volume of rows actually served unreadable
 * to the currently-serving fleet.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "unreadableByServingFleetCount", operator: "greater_than_or_equal", comparedTo: 280 },
  ],
  sustainedSeconds: 45,
};
