import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CONSUMER_PARALLELISM_KEY, DELAYED_PROCESSING_TOLERANCE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "scaled-amplified-divergence": 520,
  "sustained-divergence": 420,
  divergence: 360,
  "unreconciled-divergence": 300,
  "validation-without-reconciliation": 300,
  "rekeyed-draining": 90,
  "bounded-reconciliation": 60,
  "ordering-restored": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${CONSUMER_PARALLELISM_KEY}:4`]: 0,
    [`${CONSUMER_PARALLELISM_KEY}:8`]: 90,
    [`${CONSUMER_PARALLELISM_KEY}:16`]: 220,
    [`${CONSUMER_PARALLELISM_KEY}:32`]: 480,
    [`${DELAYED_PROCESSING_TOLERANCE_KEY}:0`]: 0,
    [`${DELAYED_PROCESSING_TOLERANCE_KEY}:500`]: 10,
    [`${DELAYED_PROCESSING_TOLERANCE_KEY}:5000`]: 40,
  },
};

/**
 * Optimal: account-id-keyed partitioning with the reorder buffer draining
 * in-flight skew. orderingIntegrityMode === "ordering-preserved" is the
 * decisive gate — unreconciledViolationCount reaching 0 is necessary but
 * not sufficient on its own (the acceptable path below also keeps it low
 * and bounded), so the string-state field is what distinguishes "the
 * physical cause is gone" from "violations are occurring but are being
 * caught."
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "unreconciledViolationCount", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "materializedStateStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "orderingIntegrityMode", operator: "equals", comparedTo: "ordering-preserved" },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: round-robin keying kept for its throughput
 * headroom, but reconciliation is proven (in rules.ts's
 * round-robin-with-full-safeguards-acceptable) to actually keep pace with
 * the ongoing violation rate — reconciliationRatePerSecond >=
 * orderingViolationRate there, so unreconciledViolationCount plateaus at
 * a small, bounded residual rather than growing. This is a genuine,
 * operationally-safe tradeoff per phase6b.md section 9 ("degraded-but-
 * safe consistency mode explicitly permitted by business requirements"),
 * NOT the same numeric bar relaxed — it is gated on the distinct
 * orderingIntegrityMode value "reordering-risk", which only the proven-
 * bounded configuration ever reaches. Every other round-robin
 * configuration sets orderingIntegrityMode to "unsafe-divergence" and
 * must never satisfy this condition.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "unreconciledViolationCount", operator: "less_than_or_equal", comparedTo: 20 },
    { key: "materializedStateStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "orderingIntegrityMode", operator: "equals", comparedTo: "reordering-risk" },
  ],
  sustainedSeconds: 15,
};

/**
 * Failure: the unreconciled backlog has grown large enough, for long
 * enough, that the materialized state is no longer a trustworthy
 * reflection of account history for a meaningful fraction of accounts.
 * Gated on the real accumulating field, not on any throughput/latency
 * metric — a candidate cannot avoid this failure by making the
 * availability metrics look good alone.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "unreconciledViolationCount", operator: "greater_than_or_equal", comparedTo: 1_200 },
  ],
  sustainedSeconds: 60,
};
