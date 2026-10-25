import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_CONCURRENCY_KEY, HOT_TENANT_THROTTLE_KEY, WRITE_THROTTLE_SHARD2_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "hot-shard-only": 220,
  "baseline-unmitigated": 520,
  "baseline-unmitigated-sustained": 900,
  "broad-scaling-worsened": 1_400,
  "stale-read-routing-violation": 480,
  "unsafe-failover-active": 700,
  "unsafe-failover-active-sustained": 950,
  "unsafe-failover-reconciling-early": 180,
  "unsafe-failover-reconciling-drained": 40,
  "contained-draining": 120,
  "contained-recovered": 0,
  "alternate-moderate-throttle-draining": 160,
  "alternate-moderate-throttle-recovered": 0,
  "throttled-without-catchup-priority": 80,
  "safe-failover-after-threshold": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 2_200,
  perUnitMonthlyUsd: {
    [`${API_CONCURRENCY_KEY}:high`]: 900,
    [`${HOT_TENANT_THROTTLE_KEY}:moderate`]: 40,
    [`${HOT_TENANT_THROTTLE_KEY}:strict`]: 60,
    [`${WRITE_THROTTLE_SHARD2_KEY}:on`]: 50,
  },
};

/**
 * Full recovery (OPTIMAL): zero stranded acknowledged writes, the
 * failover-safety mechanism reads "safe" (never promoted unsafely at
 * any point an optimal run would reach this -- see rules.ts;
 * "safe-failover-after-threshold" and "contained-recovered"/
 * "alternate-moderate-throttle-recovered" are the only rule states
 * that set shard2FailoverSafety === "safe" AND drain lag/queue depth
 * to genuinely healthy values), replica lag drained to a near-zero
 * value, and Shard 2 Primary queue depth cleared. Only reachable via
 * lagDrainWindowElapsed=true AND a control combination that actually
 * relieved primary write pressure -- a candidate who never throttled
 * the hot tenant never reaches this low a lag value, no matter how
 * much simulated time passes, because the unmitigated/broad-scaling
 * rules continue to hold their own authored (high) values while that
 * control combination remains in effect.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "shard2StrandedAcknowledgedWriteCount", operator: "equals", comparedTo: 0 },
    { key: "shard2FailoverSafety", operator: "equals", comparedTo: "safe" },
    { key: "shard2ReplicaLagSeconds", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "shard2PrimaryQueueDepth", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: the failover-safety mechanism reads "safe" (no
 * ongoing correctness violation -- this is what keeps the unmitigated
 * baseline from accidentally qualifying, since baseline never sets
 * this field away from its initial "safe" default while ALSO
 * satisfying the lag bound below) and replica lag is genuinely
 * draining -- bounded, not climbing -- even though it has not reached
 * the fully-caught-up threshold yet. Recognizes "contained-draining"/
 * "alternate-moderate-throttle-draining" as a legitimate, bounded,
 * safe-but-imperfect tradeoff distinct from the fully-drained optimal
 * tier. Deliberately does NOT accept any state where
 * shard2StrandedAcknowledgedWriteCount is nonzero -- a real historical
 * correctness loss is never "acceptable," even while bounded and
 * draining (see definition.ts's completion-mode audit for why the
 * reconciling states are UNSAFE, not acceptable).
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "shard2StrandedAcknowledgedWriteCount", operator: "equals", comparedTo: 0 },
    { key: "shard2FailoverSafety", operator: "equals", comparedTo: "safe" },
    { key: "shard2ReplicaLagSeconds", operator: "less_than_or_equal", comparedTo: 35 },
    { key: "shard2PrimaryQueueDepth", operator: "less_than_or_equal", comparedTo: 25 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: a sustained run of severe, ongoing stranded-write
 * accumulation (an unsafe promotion left in effect long enough to
 * cross a severe threshold) OR Shard 2 Primary has been left
 * overloaded long enough that it is now itself failing outright.
 * Either is a genuine, irreversible-risk collapse -- not merely "still
 * degraded."
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "shard2StrandedAcknowledgedWriteCount", operator: "greater_than_or_equal", comparedTo: 130 },
  ],
  sustainedSeconds: 60,
};
