import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_INSTANCE_COUNT_KEY, DB_CONNECTION_POOL_SIZE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "scaled-contention": 650,
  "pool-widened-contention": 600,
  "pool-saturated": 580,
  "full-table-scan": 420,
  "page-size-reduced": 140,
  "cache-warming": 130,
  "endpoint-disabled": 60,
  "recovered-indexed": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 400,
  perUnitMonthlyUsd: {
    [`${API_INSTANCE_COUNT_KEY}:4`]: 0,
    [`${API_INSTANCE_COUNT_KEY}:8`]: 220,
    [`${API_INSTANCE_COUNT_KEY}:16`]: 520,
    [`${API_INSTANCE_COUNT_KEY}:32`]: 1_100,
    [`${DB_CONNECTION_POOL_SIZE_KEY}:20`]: 0,
    [`${DB_CONNECTION_POOL_SIZE_KEY}:50`]: 60,
    [`${DB_CONNECTION_POOL_SIZE_KEY}:100`]: 150,
    [`${DB_CONNECTION_POOL_SIZE_KEY}:200`]: 340,
  },
};

/**
 * Full recovery: the targeted index is live (orderHistoryQueryHealth ===
 * "indexed") and every customer-facing metric is healthy — a genuine,
 * durable fix. Gating on orderHistoryQueryHealth rather than only the
 * numeric metrics is deliberate: disabling the endpoint also drives
 * dbCpuUtilization/scannedRowsPerQuery down to near zero, but that is
 * the acceptable tier below, not optimal — see this file's
 * acceptableCondition and definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "dbCpuUtilization", operator: "less_than_or_equal", comparedTo: 30 },
    { key: "dbStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "orderHistoryQueryHealth", operator: "equals", comparedTo: "indexed" },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: the expensive endpoint is disabled
 * (orderHistoryQueryHealth === "feature-disabled"). Every customer-
 * facing metric the candidate can see (DB CPU, latency, connections) is
 * genuinely healthy, but this is reached only because the order-history
 * feature itself has been turned off, not because the underlying
 * missing index was fixed — see completion-mode audit in definition.ts.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "dbCpuUtilization", operator: "less_than_or_equal", comparedTo: 30 },
    { key: "dbStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "orderHistoryQueryHealth", operator: "equals", comparedTo: "feature-disabled" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "dbCpuUtilization", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
