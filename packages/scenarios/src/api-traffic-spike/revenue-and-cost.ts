import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_INSTANCE_COUNT_KEY, DB_CONNECTION_POOL_SIZE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "scaled-contention": 700,
  "pool-widened-contention": 650,
  "pool-saturated": 680,
  "traffic-spiking": 380,
  "queue-bounded-partial": 220,
  "db-protected-cache-cold": 90,
  "rate-limited": 70,
  "endpoint-disabled": 40,
  "recovered-protected": 0,
  "recovered-cache-fixed": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${API_INSTANCE_COUNT_KEY}:4`]: 0,
    [`${API_INSTANCE_COUNT_KEY}:8`]: 240,
    [`${API_INSTANCE_COUNT_KEY}:16`]: 560,
    [`${API_INSTANCE_COUNT_KEY}:32`]: 1_200,
    [`${DB_CONNECTION_POOL_SIZE_KEY}:20`]: 0,
    [`${DB_CONNECTION_POOL_SIZE_KEY}:50`]: 70,
    [`${DB_CONNECTION_POOL_SIZE_KEY}:100`]: 170,
    [`${DB_CONNECTION_POOL_SIZE_KEY}:200`]: 380,
  },
};

/**
 * Full recovery: the database connection pool is genuinely shielded from
 * the cache-miss flood — trafficSpikeHealth is "protected" (set only by
 * the two real-fix rules: DB protection, cache behavior, or both) and
 * every customer-facing metric is healthy. Gating on trafficSpikeHealth
 * rather than only the numeric metrics is deliberate: disabling the
 * non-critical endpoint or turning on rate limiting also drives
 * dbConnectionUtilization down, but those are the acceptable tier below,
 * not optimal — see this file's acceptableCondition and definition.ts's
 * completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "dbConnectionUtilization", operator: "less_than_or_equal", comparedTo: 35 },
    { key: "dbStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "trafficSpikeHealth", operator: "equals", comparedTo: "protected" },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: the database connection pool has been pulled back
 * to a genuinely safe, non-critical level (dbConnectionUtilization <= 60,
 * dbStatus not critical) WITHOUT the system having actually reached
 * trafficSpikeHealth === "protected" — i.e. safety was bought by shedding
 * load (DB admission control alone while the cache stays cold, rate
 * limiting legitimate traffic, or disabling the non-critical endpoint),
 * never by the two real root fixes. Reaches exactly db-protection-alone
 * (dbConnectionUtilization 58), rate-limited (30), and endpoint-disabled
 * (28) — never the baseline (82), the bounded-queue partial relief (86,
 * still genuinely unsafe), or either harmful scaling path (97-99) — see
 * completion-mode audit in definition.ts.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "dbConnectionUtilization", operator: "less_than_or_equal", comparedTo: 60 },
    { key: "dbStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "trafficSpikeHealth", operator: "not_equals", comparedTo: "protected" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "dbConnectionUtilization", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
