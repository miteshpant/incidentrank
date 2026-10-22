import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { AUTH_SERVICE_INSTANCES_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  degrading: 600,
  "severe-degradation": 900,
  "security-compromised": 0,
  degraded: 150,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${AUTH_SERVICE_INSTANCES_KEY}:2`]: 0,
    [`${AUTH_SERVICE_INSTANCES_KEY}:4`]: 120,
    [`${AUTH_SERVICE_INSTANCES_KEY}:8`]: 340,
    [`${AUTH_SERVICE_INSTANCES_KEY}:16`]: 780,
  },
};

/**
 * The success condition can only read numeric state/trigger values — it
 * has no way to penalize "metrics look fine because verification was
 * skipped" versus "metrics are fine because the system is actually
 * healthy." A real operator declaring victory from dashboards alone could
 * make the exact same mistake. The scoring layer is what actually
 * catches this: operationalEfficiency's harmfulChangeCount penalty (see
 * scoring.ts and action-classifications.ts) has full visibility into
 * which controls were set, independent of what the live metrics show, so
 * signatureVerificationBypassEnabled=true is still correctly penalized
 * even though the engine's pass/fail resolution alone could not
 * distinguish it from genuine recovery. In practice, authFailureRate
 * stays below the success threshold during the bypass path too
 * (0.05 < 1), so the attempt may resolve "successfully" — the lesson
 * lives entirely in the score breakdown, not in whether the incident
 * closes out as resolved vs. failed.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "authServiceLatencyMs", operator: "less_than_or_equal", comparedTo: 100 },
    { key: "authFailureRate", operator: "less_than", comparedTo: 1 },
    { key: "authServiceStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "authFailureRate", operator: "greater_than_or_equal", comparedTo: 15 }],
  sustainedSeconds: 60,
};
