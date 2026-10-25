import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { DEPENDENCY_PROTECTION_MODE_KEY, NEW_VERSION_INSTANCE_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "cross-contaminated": 900,
  "scaled-contention": 760,
  regressing: 520,
  "isolated-pool-contained": 480,
  "dependency-rate-limited": 240,
  "dependency-protected": 180,
  healthy: 0,
  "rolled-back": 0,
  "feature-disabled": 0,
  "rollout-zeroed": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${NEW_VERSION_INSTANCE_COUNT_KEY}:4`]: 0,
    [`${NEW_VERSION_INSTANCE_COUNT_KEY}:8`]: 180,
    [`${NEW_VERSION_INSTANCE_COUNT_KEY}:16`]: 460,
    [`${NEW_VERSION_INSTANCE_COUNT_KEY}:32`]: 980,
    [`${DEPENDENCY_PROTECTION_MODE_KEY}:none`]: 0,
    [`${DEPENDENCY_PROTECTION_MODE_KEY}:rate-limit`]: 40,
    [`${DEPENDENCY_PROTECTION_MODE_KEY}:circuit-breaker`]: 70,
  },
};

/**
 * Full recovery: the regression no longer runs for any live traffic
 * (regressionHealth === "regression-removed") — reached via rollback,
 * feature-flag disable, or driving rollout percentage to zero — and
 * customer success is fully healthy. Gating on regressionHealth rather
 * than only the numeric metrics is deliberate: masking paths (scaling,
 * dependency protection alone) can look superficially calmer on
 * sharedDependencyPressure without ever stopping the regressed code from
 * running, which is exactly the "fixed vs. merely absorbed" distinction
 * this scenario is designed to test — see this file's acceptableCondition
 * and definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "customerSuccessRate", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "newVersionErrorRate", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "regressionHealth", operator: "equals", comparedTo: "regression-removed" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "customerSuccessRate", operator: "less_than_or_equal", comparedTo: 80 }],
  sustainedSeconds: 60,
};
