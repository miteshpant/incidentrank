import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { POOL_SIZE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  saturated: 500,
  "saturated-worsening": 900,
  degraded: 120,
  // Slightly worse than plain "degraded" (errorRate 4.5 vs 3.5,
  // queuedConnections 165 vs 40) — the visibly rising batch pressure
  // reflects genuinely accumulating risk, not just a cosmetic UI change.
  "degraded-batch-pressure-rising": 180,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 200,
  perUnitMonthlyUsd: {
    [`${POOL_SIZE_KEY}:20`]: 0,
    [`${POOL_SIZE_KEY}:50`]: 60,
    [`${POOL_SIZE_KEY}:100`]: 180,
    [`${POOL_SIZE_KEY}:200`]: 420,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "connectionUsage", operator: "less_than_or_equal", comparedTo: 60 },
    { key: "errorRate", operator: "less_than", comparedTo: 1 },
    { key: "dbStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 20 }],
  sustainedSeconds: 60,
};
