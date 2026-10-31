import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { DEPLOY_STRATEGY_KEY, DRAIN_TIMEOUT_SECONDS_KEY, REPLICA_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  dropping: 420,
  degraded: 160,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${DRAIN_TIMEOUT_SECONDS_KEY}:0`]: 0,
    [`${DRAIN_TIMEOUT_SECONDS_KEY}:5`]: 0,
    [`${DRAIN_TIMEOUT_SECONDS_KEY}:15`]: 0,
    [`${DRAIN_TIMEOUT_SECONDS_KEY}:30`]: 0,
    [`${DRAIN_TIMEOUT_SECONDS_KEY}:45`]: 0,
    [`${DEPLOY_STRATEGY_KEY}:rolling`]: 0,
    [`${DEPLOY_STRATEGY_KEY}:surge`]: 90,
    [`${DEPLOY_STRATEGY_KEY}:blue-green`]: 220,
    [`${REPLICA_COUNT_KEY}:4`]: 0,
    [`${REPLICA_COUNT_KEY}:6`]: 110,
    [`${REPLICA_COUNT_KEY}:8`]: 220,
    [`${REPLICA_COUNT_KEY}:12`]: 440,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "droppedRequestsPerDeploy", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "checkoutErrorRate", operator: "less_than_or_equal", comparedTo: 0.5 },
    { key: "podTerminationGraceExceededCount", operator: "less_than_or_equal", comparedTo: 2 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "podTerminationGraceExceededCount", operator: "greater_than_or_equal", comparedTo: 30 }],
  sustainedSeconds: 60,
};
