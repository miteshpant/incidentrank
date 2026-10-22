import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  CHECKOUT_INSTANCES_KEY,
  DB_CONNECTION_LIMIT_KEY,
  KAFKA_CONSUMERS_KEY,
  PAYMENT_INSTANCES_KEY,
} from "./controls";

/**
 * Authored revenue-loss rate per simulated minute, keyed by the incident
 * state a rule declares. "healthy" and "resolved" accrue nothing.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  resolved: 0,
  "storm-critical": 12_000,
  "storm-reduced": 5_000,
  "storm-controlled": 5_000,
  recovering: 1_500,
};

const BASELINE_INSTANCES = 8;
const BASELINE_CONNECTIONS = 500;

function perInstanceCostTable(
  controlKey: string,
  costPerExtraInstanceUsd: number,
) {
  const table: Record<string, number> = {};
  for (const instances of [4, 8, 12, 16, 24]) {
    const extra = Math.max(0, instances - BASELINE_INSTANCES);
    table[`${controlKey}:${instances}`] = extra * costPerExtraInstanceUsd;
  }
  return table;
}

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 20_000,
  perUnitMonthlyUsd: {
    ...perInstanceCostTable(CHECKOUT_INSTANCES_KEY, 150),
    ...perInstanceCostTable(PAYMENT_INSTANCES_KEY, 200),
    ...perInstanceCostTable(KAFKA_CONSUMERS_KEY, 90),
    [`${DB_CONNECTION_LIMIT_KEY}:250`]: -600,
    [`${DB_CONNECTION_LIMIT_KEY}:${BASELINE_CONNECTIONS}`]: 0,
    [`${DB_CONNECTION_LIMIT_KEY}:750`]: 900,
    [`${DB_CONNECTION_LIMIT_KEY}:1000`]: 2_200,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "checkoutSuccessRate", operator: "greater_than_or_equal", comparedTo: 95 },
    { key: "checkoutP99LatencyMs", operator: "less_than_or_equal", comparedTo: 3_000 },
    { key: "paymentTraffic", operator: "not_equals", comparedTo: "critical" },
    { key: "dbPressure", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "checkoutSuccessRate", operator: "less_than", comparedTo: 60 },
  ],
  sustainedSeconds: 3 * 60,
};
