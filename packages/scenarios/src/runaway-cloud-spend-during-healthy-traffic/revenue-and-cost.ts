import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  AUTOSCALER_TARGET_UTILIZATION_KEY,
  IDLE_CAPACITY_POLICY_KEY,
  MIN_REPLICA_COUNT_KEY,
  REQUEST_BATCHING_MODE_KEY,
  WARM_POOL_SIZE_KEY,
  WORKER_INSTANCE_CLASS_KEY,
} from "./controls";

/**
 * There is no outage anywhere in this scenario, so revenue loss is
 * deliberately small/flat across every state EXCEPT the one place a
 * real, if small, customer-facing cost is authored: pairing an
 * undersized instance class with no batching (economy-class-without-
 * batching) measurably raises p99 latency. Every other state —
 * including every unsafe-minimum-cost state — has ~zero revenue loss,
 * which is exactly why this scenario cannot and does not rely on
 * customerImpact to catch the unsafe path: that work is done by
 * dataIntegrity/reliability reading redundancyHeadroomStatus /
 * cumulativeHeadroomBreachSeconds instead (see scoring.ts).
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "cost-anomaly-baseline": 0,
  "cost-anomaly-sustained": 0,
  "floor-breached-compounded": 0,
  "floor-breached-compounded-sustained": 0,
  "min-replica-floor-breached": 0,
  "min-replica-floor-breached-sustained": 0,
  "idle-policy-floor-breached": 0,
  "idle-policy-floor-breached-sustained": 0,
  "aggressive-utilization-without-rightsizing": 10,
  "economy-class-without-batching": 140,
  "batching-engaged-utilization-rising": 0,
  "path-b-optimal-batched-and-drained": 20,
  "path-a-rightsizing-just-engaged": 0,
  "path-a-rightsizing-draining-window1": 0,
  "path-a-rightsizing-draining-window2": 0,
  "path-a-optimal-fully-drained": 0,
  "floor-lowered-alone-partial": 0,
  healthy: 0,
};

/**
 * Baseline cost is authored to represent the scenario's STARTING,
 * already-inflated spend level — the fixed per-instance/per-replica
 * costs below are what the candidate's control choices change relative
 * to that baseline, so costIncreaseRatio (peak vs. this baseline)
 * genuinely rewards reducing spend below the opening, wasteful level
 * rather than merely "not increasing it further."
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 3_750,
  perUnitMonthlyUsd: {
    [`${AUTOSCALER_TARGET_UTILIZATION_KEY}:30`]: 0,
    [`${AUTOSCALER_TARGET_UTILIZATION_KEY}:55`]: -900,
    [`${AUTOSCALER_TARGET_UTILIZATION_KEY}:80`]: -1_300,
    [`${MIN_REPLICA_COUNT_KEY}:40`]: 0,
    [`${MIN_REPLICA_COUNT_KEY}:6`]: -1_400,
    [`${MIN_REPLICA_COUNT_KEY}:2`]: -1_650,
    [`${WORKER_INSTANCE_CLASS_KEY}:large`]: 0,
    [`${WORKER_INSTANCE_CLASS_KEY}:standard`]: -400,
    [`${WORKER_INSTANCE_CLASS_KEY}:economy`]: -620,
    [`${REQUEST_BATCHING_MODE_KEY}:disabled`]: 0,
    [`${REQUEST_BATCHING_MODE_KEY}:adaptive`]: -350,
    [`${REQUEST_BATCHING_MODE_KEY}:aggressive`]: -500,
    [`${WARM_POOL_SIZE_KEY}:20`]: 0,
    [`${WARM_POOL_SIZE_KEY}:4`]: -280,
    [`${WARM_POOL_SIZE_KEY}:0`]: -340,
    [`${IDLE_CAPACITY_POLICY_KEY}:keep-warm`]: 0,
    [`${IDLE_CAPACITY_POLICY_KEY}:scale-to-min`]: -220,
    [`${IDLE_CAPACITY_POLICY_KEY}:scale-to-floor-minus-two`]: -260,
  },
};

/**
 * successCondition (OPTIMAL): cost materially reduced below the
 * opening level AND redundancy genuinely protected AND no breach has
 * ever occurred this attempt. costSafetyStatus === "efficient-safe" is
 * the single authoritative marker both real alternate paths (A and B)
 * reach — see rules.ts's path-a-optimal-fully-drained and
 * path-b-optimal-batched-and-drained, the only two rules that ever set
 * it.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "costSafetyStatus", operator: "equals", comparedTo: "efficient-safe" },
    { key: "redundancyHeadroomStatus", operator: "equals", comparedTo: "protected" },
    { key: "cumulativeHeadroomBreachSeconds", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 20,
};

/**
 * acceptableCondition (ACCEPTABLE): a genuine, in-progress rightsizing
 * effort — redundancy is already protected and no breach has ever
 * occurred, but cost has not yet fully drained to its new safe target
 * (recovery-lag still in progress). This is a real, deliberate
 * "rightsizing underway, safe to hand back as a known work-in-progress"
 * state, not a disguised failure — mirrors Identity Platform
 * Degradation's bounded-degraded acceptable tier.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "costSafetyStatus", operator: "equals", comparedTo: "rightsizing" },
    { key: "redundancyHeadroomStatus", operator: "equals", comparedTo: "protected" },
    { key: "cumulativeHeadroomBreachSeconds", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 20,
};

/**
 * Failure: the redundancy floor has been breached for long enough that
 * the cumulative exposure represents a real, sustained structural
 * safety failure, not a brief misconfiguration — mirrors Identity
 * Platform Degradation's historical-count failure gate. Failure is
 * never gated by completion mode (tick.ts), so a candidate cannot
 * simply decline to Finish and wait out a live, worsening redundancy
 * breach while enjoying its excellent raw cost numbers.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "cumulativeHeadroomBreachSeconds", operator: "greater_than_or_equal", comparedTo: 200 },
  ],
  sustainedSeconds: 45,
};
