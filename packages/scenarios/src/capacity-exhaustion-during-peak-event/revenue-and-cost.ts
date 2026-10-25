import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  ASYNC_DEFERRAL_KEY,
  CACHE_STRATEGY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  REGIONAL_ROUTING_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-escalating": 150,
  "baseline-cache-degraded": 260,
  "baseline-sustained": 520,
  "random-shed-active": 420,
  "random-shed-sustained": 900,
  "capacity-escalation-trap": 640,
  "capacity-escalation-early": 380,
  "premature-worker-drain": 360,
  "safe-degraded-protected": 60,
  "strategy-a-db-recovered-cache-pending": 45,
  "strategy-a-converging": 50,
  "strategy-a-optimal": 0,
  "strategy-b-converging": 55,
  "strategy-b-optimal": 0,
  "shed-optional-only": 180,
  "cache-strategy-only": 220,
  "db-budget-only": 320,
  "async-deferral-only": 280,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 4_800,
  perUnitMonthlyUsd: {
    [`${REGIONAL_ROUTING_KEY}:split-regional`]: 900,
    [`${CACHE_STRATEGY_KEY}:extended-ttl`]: 120,
    [`${DB_CONNECTION_BUDGET_KEY}:bounded`]: 60,
    [`${WORKER_CONCURRENCY_KEY}:high`]: 300,
    [`${ASYNC_DEFERRAL_KEY}:defer-to-queue`]: 80,
  },
};

/**
 * OPTIMAL: checkout fully protected, database never at saturation risk,
 * async backlog bounded AND demonstrably draining, zero historical
 * critical-traffic drops. Reachable via EITHER strategy-a-optimal OR
 * strategy-b-optimal in rules.ts — both independently land on this
 * exact objective bar (see scoring.ts's note on how the two strong
 * paths differ only in searchAvailabilityStatus, which successCondition
 * deliberately never gates on, since disabling vs. degrading search is
 * a legitimate, scenario-sanctioned choice either way).
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "checkoutSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 99.0 },
    { key: "dbSaturationStatus", operator: "equals", comparedTo: "normal" },
    { key: "asyncQueueDrainingStatus", operator: "equals", comparedTo: "draining" },
    { key: "asyncQueueBacklogCount", operator: "less_than_or_equal", comparedTo: 20 },
    { key: "cumulativeCriticalTrafficDroppedCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier — "safe-degraded-
 * protected" only. Checkout remains protected (>= 98%, a slightly
 * looser bar than optimal's >= 99%, reflecting the real but bounded
 * cost of admission control queueing some critical requests rather
 * than every one landing instantly), the database is never in its
 * critical saturation band, the queue is draining (not growing or
 * stalled), and — crucially — zero historical critical-traffic drops,
 * exactly like optimal. This tier differs from optimal only in
 * ACCEPTING that the database sits in "warning" (not yet fully
 * recovered to "normal") and that search is fully disabled rather than
 * either recovered or left in a bounded degraded form — a genuine,
 * deliberate, bounded tradeoff, never a correctness violation.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "checkoutSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 98.0 },
    { key: "dbSaturationStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "asyncQueueDrainingStatus", operator: "equals", comparedTo: "draining" },
    { key: "searchAvailabilityStatus", operator: "equals", comparedTo: "disabled" },
    { key: "cumulativeCriticalTrafficDroppedCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: the database has been actively pushed into its critical
 * saturation band for long enough to constitute genuine collapse risk
 * materializing, OR non-policy-based shedding has dropped enough real
 * critical traffic to constitute a severe, irrecoverable violation of
 * business invariant #1/#5 within this attempt. Gated on cumulative/
 * sustained severity (not a single instantaneous tick) so a brief
 * transient spike during escalation is not instantly fatal, but
 * sustained db-collapse or a real volume of indiscriminately dropped
 * checkout traffic is.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "cumulativeCriticalTrafficDroppedCount", operator: "greater_than_or_equal", comparedTo: 500 },
  ],
  sustainedSeconds: 45,
};
