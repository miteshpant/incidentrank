import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY, MIGRATION_RETRY_BACKOFF_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  cascading: 700,
  critical: 900,
  degraded: 200,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 520,
  perUnitMonthlyUsd: {
    [`${FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY}:0`]: 0,
    [`${FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY}:25`]: 40,
    [`${FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY}:50`]: 90,
    [`${FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY}:100`]: 180,
    [`${MIGRATION_RETRY_BACKOFF_KEY}:1`]: 0,
    [`${MIGRATION_RETRY_BACKOFF_KEY}:5`]: 0,
    [`${MIGRATION_RETRY_BACKOFF_KEY}:30`]: 0,
    [`${MIGRATION_RETRY_BACKOFF_KEY}:120`]: 0,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "appServiceErrorRatePercent", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "azCConnectionUtilizationPercent", operator: "less_than", comparedTo: 60 },
    { key: "migrationRetryRatePerMinute", operator: "less_than_or_equal", comparedTo: 1 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "azCConnectionUtilizationPercent", operator: "greater_than_or_equal", comparedTo: 98 }],
  sustainedSeconds: 60,
};
