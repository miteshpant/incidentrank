import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { LOW_PRIORITY_INGESTION_THROTTLE_KEY, PROCESSOR_CONCURRENCY_KEY, WAREHOUSE_WRITER_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-lagging": 90,
  "baseline-sustained-lagging": 260,
  "throttled-no-scaling": 230,
  "backpressure-no-scaling": 210,
  "small-batch-no-scaling": 250,
  "processor-scaled-warehouse-contention": 320,
  "partial-warehouse-protection-concurrency-only": 180,
  "partial-warehouse-protection-cadence-only": 190,
  "tier1-breached-unmanaged": 300,
  "drop-events-trap-active": 70,
  "drop-events-trap-sustained": 110,
  "drop-events-scarred-live-safe": 40,
  "safely-scaled-just-engaged": 60,
  "draining-window1-unthrottled": 35,
  "draining-window1-throttled": 25,
  "draining-window2-unthrottled": 15,
  "draining-window2-throttled": 10,
  "fully-recovered": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_600,
  perUnitMonthlyUsd: {
    [`${PROCESSOR_CONCURRENCY_KEY}:high`]: 420,
    [`${WAREHOUSE_WRITER_CONCURRENCY_KEY}:high`]: 240,
    [`${LOW_PRIORITY_INGESTION_THROTTLE_KEY}:true`]: 30,
  },
};

/**
 * OPTIMAL: processor fully caught up (processorLagSeconds low), both
 * backlogs genuinely drained (tier2BacklogCount = 0, not merely bounded),
 * Tier-1 within SLO, Warehouse safe, and no event ever dropped. Only
 * reachable via "fully-recovered" in rules.ts, which itself requires the
 * full protected combination (safe scaling + Tier-1 prioritized + no
 * drops) AND the longest elapsed drain window.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "tier1FreshnessSeconds", operator: "less_than_or_equal", comparedTo: 120 },
    { key: "tier2BacklogCount", operator: "equals", comparedTo: 0 },
    { key: "warehouseWriteSuccessRate", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "droppedEventCount", operator: "equals", comparedTo: 0 },
    { key: "pipelineStatus", operator: "equals", comparedTo: "recovered" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe state this scenario
 * explicitly encourages (phase6d3.md scenario spec) — Tier-1 stays
 * within its 120s SLO, the Warehouse stays safe (no contention, no
 * durability risk), no event has ever been dropped, and the Tier-2
 * backlog is BOUNDED (below a real authored ceiling, well under the
 * baseline's 420-480 peak) AND explicitly "draining" (not merely
 * "contended" or "diverging") — pipelineStatus is the gate that keeps a
 * still-growing or Warehouse-contended state from accidentally
 * qualifying by coincidence of a backlog number alone.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "tier1FreshnessSeconds", operator: "less_than_or_equal", comparedTo: 120 },
    { key: "tier2BacklogCount", operator: "less_than_or_equal", comparedTo: 200 },
    { key: "warehouseWriteSuccessRate", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "droppedEventCount", operator: "equals", comparedTo: 0 },
    { key: "pipelineStatus", operator: "equals", comparedTo: "draining" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: either (a) dropped-event count has run long enough to reach a
 * severe, unrecoverable total — a correctness collapse, not merely "still
 * degraded" — or (b) Tier-1 freshness has blown far past its SLO for a
 * sustained period, indicating the operational-data invariant has been
 * abandoned, not merely temporarily strained.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "droppedEventCount", operator: "greater_than_or_equal", comparedTo: 450 }],
  sustainedSeconds: 30,
};
