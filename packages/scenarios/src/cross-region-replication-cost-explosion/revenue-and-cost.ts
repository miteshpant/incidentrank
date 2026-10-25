import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  ARCHIVE_REPLICATION_MODE_KEY,
  CRITICAL_REPLICATION_FACTOR_KEY,
  LOW_PRIORITY_REGION_FAN_OUT_KEY,
  LOW_PRIORITY_REPLICATION_FACTOR_KEY,
  STANDARD_REPLICATION_MODE_KEY,
  TRANSFER_BATCHING_KEY,
  TRANSFER_COMPRESSION_KEY,
} from "./controls";

/**
 * No state in this scenario ever loses live customer-facing revenue —
 * there is no outage anywhere in this rule table (see rules.ts's doc
 * comment): every data class stays within its own freshness bound
 * throughout, and even the unsafe-minimum-cost durability breach has no
 * availability signature at all (durability and availability are
 * orthogonal properties — under-replicated data is just as fast to
 * read/write as fully-replicated data; it is only less safe against a
 * REGIONAL LOSS event, which this scenario represents as a drill/audit
 * consequence, never a live outage). The entire "cost" story is carried
 * by monthlyCrossRegionTransferCostUsd/monthlyStorageDuplicationCostUsd
 * (read directly off the matched rule's authored values, for
 * candidate-facing display) and by infrastructureCost below (the
 * generic engine's own per-control-value cost model, read by the
 * costIncreaseRatio scoring measure) — not by revenueLossRatePerMinute,
 * which stays all-zero intentionally.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {};

/**
 * Baseline cost is authored to represent the scenario's STARTING,
 * already-inflated spend level set by last week's policy change — the
 * per-control-value increments below are all authored as NEGATIVE
 * deltas off this expensive baseline (mirroring Runaway Cloud Spend
 * During Healthy Traffic's and Overprovisioned Resilience During
 * Low-Risk Period's identical convention), so costIncreaseRatio (peak
 * vs. this baseline) genuinely rewards reducing spend below the
 * opening, policy-driven level rather than merely "not increasing it
 * further."
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 6_300,
  perUnitMonthlyUsd: {
    [`${CRITICAL_REPLICATION_FACTOR_KEY}:3`]: 0,
    [`${CRITICAL_REPLICATION_FACTOR_KEY}:2`]: -900,
    [`${CRITICAL_REPLICATION_FACTOR_KEY}:1`]: -1_800,
    [`${LOW_PRIORITY_REPLICATION_FACTOR_KEY}:3`]: 0,
    [`${LOW_PRIORITY_REPLICATION_FACTOR_KEY}:2`]: -500,
    [`${LOW_PRIORITY_REPLICATION_FACTOR_KEY}:1`]: -950,
    [`${LOW_PRIORITY_REGION_FAN_OUT_KEY}:all-regions`]: 0,
    [`${LOW_PRIORITY_REGION_FAN_OUT_KEY}:origin-plus-one`]: -600,
    [`${STANDARD_REPLICATION_MODE_KEY}:sync`]: 0,
    [`${STANDARD_REPLICATION_MODE_KEY}:async-batched`]: -550,
    [`${TRANSFER_COMPRESSION_KEY}:off`]: 0,
    [`${TRANSFER_COMPRESSION_KEY}:on`]: -350,
    [`${ARCHIVE_REPLICATION_MODE_KEY}:full-sync`]: 0,
    [`${ARCHIVE_REPLICATION_MODE_KEY}:scheduled-batch`]: -400,
    [`${TRANSFER_BATCHING_KEY}:small-frequent`]: 0,
    [`${TRANSFER_BATCHING_KEY}:large-batched`]: -200,
  },
};

/**
 * successCondition (OPTIMAL): the durability floor is explicitly
 * compliant, no historical exposure has ever been recorded
 * (criticalDataExposureEventCount), AND real, substantial TOTAL cost
 * relief has genuinely been achieved — gated on
 * monthlyTotalReplicationCostUsd (transfer cost + storage-duplication
 * cost combined) dropping meaningfully below the exploded baseline of
 * 6,300. Gating on the COMBINED field (rather than either cost field
 * alone) is deliberate: a candidate who only ever reduces the
 * storage-duplication half (archive-only-fix) or only the transfer
 * half must still be judged on real, total spend relief, never missed
 * because the one field a narrower gate happened to check didn't move.
 * This three-field gate mirrors Replication Backlog's dual-field
 * successCondition: a candidate who achieves durability compliance
 * alone (e.g. "pinned-no-other-action", still at 6,300 total) has
 * fixed nothing about the actual incident (the cost explosion) and
 * must not be allowed to pass successCondition merely for having
 * touched nothing unsafe. Reachable via either Strategy A
 * (strategy-a-scope-reduction, total 3,500) or the fully-combined tier
 * (both-strategies-fully-optimized, total 2,130) — two genuinely
 * different mechanisms both clearing the same bar.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "criticalDataDurabilityStatus", operator: "equals", comparedTo: "policy-compliant" },
    { key: "criticalDataExposureEventCount", operator: "equals", comparedTo: 0 },
    { key: "monthlyTotalReplicationCostUsd", operator: "less_than_or_equal", comparedTo: 3_600 },
  ],
  sustainedSeconds: 30,
};

/**
 * acceptableCondition (ACCEPTABLE): durability is explicitly compliant
 * and clean (zero historical exposure), but TOTAL cost relief is only
 * partial — a genuine, deliberate safe-but-wasteful handback state,
 * distinct from the fully optimized successCondition above. Reachable
 * via Strategy B alone (strategy-b-async-batched, total 4,850) or
 * either single orthogonal lever alone (archive-only-fix /
 * compression-only-fix, total 5,250) — real relief from the 6,300
 * baseline, just not enough to clear the OPTIMAL bar.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "criticalDataDurabilityStatus", operator: "equals", comparedTo: "policy-compliant" },
    { key: "criticalDataExposureEventCount", operator: "equals", comparedTo: 0 },
    { key: "monthlyTotalReplicationCostUsd", operator: "less_than_or_equal", comparedTo: 5_300 },
  ],
  sustainedSeconds: 30,
};

/**
 * Automatic failure: deliberately unreachable. This scenario never
 * self-propagates into an availability outage — a durability-floor
 * breach, however severe, leaves the live system fully functional (see
 * revenueLossRatePerMinute's comment); the only consequence of leaving
 * the floor breached is the historical exposure counter, which is
 * scored (dataIntegrity/reliability), never auto-failed. failureCondition
 * still must be present on the compiled type, so it is authored with a
 * condition this scenario's real value ranges can never satisfy.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "monthlyTotalReplicationCostUsd", operator: "less_than", comparedTo: 0 }],
  sustainedSeconds: 999_999,
};
