import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CACHE_NODE_COUNT_KEY, APPLICATION_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "node-down-unmitigated": 180,
  "warming-induced-db-spike": 420,
  "db-overload-amplified": 400,
  "db-connection-contention": 450,
  "masked-degradation": 150,
  recovering: 0,
  "recovering-via-fallback": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${CACHE_NODE_COUNT_KEY}:2`]: 0,
    [`${CACHE_NODE_COUNT_KEY}:3`]: 0,
    [`${CACHE_NODE_COUNT_KEY}:4`]: 90,
    [`${CACHE_NODE_COUNT_KEY}:5`]: 180,
    [`${APPLICATION_CONCURRENCY_KEY}:low`]: 0,
    [`${APPLICATION_CONCURRENCY_KEY}:medium`]: 40,
    [`${APPLICATION_CONCURRENCY_KEY}:high`]: 120,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "cacheHitRatePercent", operator: "greater_than_or_equal", comparedTo: 85 },
    { key: "dbReadsPerSecond", operator: "less_than_or_equal", comparedTo: 200 },
    { key: "cacheStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "dbReadsPerSecond", operator: "greater_than_or_equal", comparedTo: 2_500 }],
  sustainedSeconds: 60,
};
