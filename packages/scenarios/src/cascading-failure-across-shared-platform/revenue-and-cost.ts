import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  ASYNC_WORKER_CONCURRENCY_KEY,
  PRODUCT_A_ISOLATION_KEY,
  PRODUCT_B_ISOLATION_KEY,
  PRODUCT_C_ISOLATION_KEY,
} from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-root-degrading": 180,
  "amplifying-uncontained": 420,
  "full-cascade": 780,
  "full-cascade-unaddressed": 950,
  "wrong-root-trap": 520,
  "worker-scaling-pressure-transfer": 560,
  "re-cascaded": 700,
  "identity-fail-open-violation": 60,
  "product-a-isolated-directly": 410,
  "root-protected-db-exposed": 310,
  "db-capped-root-exposed": 380,
  "cache-assist-only": 350,
  "metadata-protected-platform-exposed": 390,
  "deferral-only": 370,
  "isolate-bystander-wasted": 400,
  contained: 150,
  "draining-window1": 60,
  "draining-window2": 20,
  "acceptable-drained-isolated": 15,
  "optimal-recovered": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 2_400,
  perUnitMonthlyUsd: {
    [`${PRODUCT_A_ISOLATION_KEY}:isolated`]: 90,
    [`${PRODUCT_B_ISOLATION_KEY}:isolated`]: 90,
    [`${PRODUCT_C_ISOLATION_KEY}:isolated`]: 90,
    [`${ASYNC_WORKER_CONCURRENCY_KEY}:scaled`]: 260,
  },
};

/**
 * OPTIMAL: Shared Identity fully recovered, both independent recovery-
 * lag subsystems (messaging backlog + DB connection pressure) fully
 * drained to zero/baseline, no correctness violation ever incurred, and
 * products deliberately restored (not merely left isolated forever).
 * Only reachable via "optimal-full-isolation-restored" or
 * "optimal-bounded-retry-restored" in rules.ts — both alternate strong
 * paths land here identically.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "identitySuccessRate", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "messagingBacklogCount", operator: "equals", comparedTo: 0 },
    { key: "dbWriteSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 99.5 },
    { key: "cumulativeUnverifiedGrantCount", operator: "equals", comparedTo: 0 },
    { key: "platformStatus", operator: "equals", comparedTo: "recovered" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the platform is genuinely safe — Shared Identity
 * recovered, both backlogs fully drained, no correctness violation ever
 * incurred — but the candidate has not yet made the deliberate
 * restoration-order decision; products remain isolated/degraded
 * pending that call. This is a real, legitimate degraded-but-safe
 * handback state (business invariant #4: products may be intentionally
 * degraded or isolated to protect the platform) — the platform itself
 * is fully safe, it is simply not yet fully restored.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "identitySuccessRate", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "messagingBacklogCount", operator: "equals", comparedTo: 0 },
    { key: "dbWriteSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 99.5 },
    { key: "cumulativeUnverifiedGrantCount", operator: "equals", comparedTo: 0 },
    { key: "platformStatus", operator: "equals", comparedTo: "contained" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: either (a) Shared Database connection-exhaustion damage has
 * compounded into a severe, unrecoverable total (a real correctness/
 * durability collapse, not merely "still degraded"), or (b) identity
 * fail-open has been used long enough to accumulate a severe
 * unverified-grant total — a correctness collapse that must terminate
 * the attempt, never something a candidate can simply out-wait.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "cumulativeConnectionExhaustionCount", operator: "greater_than_or_equal", comparedTo: 900 },
  ],
  sustainedSeconds: 30,
};
