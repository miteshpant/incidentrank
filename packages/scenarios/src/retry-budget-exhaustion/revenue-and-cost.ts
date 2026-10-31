import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { PRICING_SERVICE_REPLICA_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  amplifying: 500,
  degraded: 200,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${PRICING_SERVICE_REPLICA_COUNT_KEY}:4`]: 0,
    [`${PRICING_SERVICE_REPLICA_COUNT_KEY}:8`]: 90,
    [`${PRICING_SERVICE_REPLICA_COUNT_KEY}:16`]: 220,
    [`${PRICING_SERVICE_REPLICA_COUNT_KEY}:32`]: 480,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "pricingErrorRatePercent", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "pricingP95LatencyMs", operator: "less_than_or_equal", comparedTo: 150 },
    { key: "retryAmplificationRatio", operator: "less_than_or_equal", comparedTo: 1 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "retryAmplificationRatio", operator: "greater_than_or_equal", comparedTo: 3 }],
  sustainedSeconds: 60,
};
