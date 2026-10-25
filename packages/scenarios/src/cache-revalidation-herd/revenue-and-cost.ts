import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_INSTANCE_COUNT_KEY, REFRESH_CONCURRENCY_LIMIT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "scaled-herd": 900,
  "retry-amplified": 760,
  "herd-retry-amplifying": 700,
  herding: 560,
  "concurrency-masked": 220,
  "expiry-approaching": 40,
  jittered: 0,
  coalesced: 0,
  "stale-served": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${API_INSTANCE_COUNT_KEY}:6`]: 0,
    [`${API_INSTANCE_COUNT_KEY}:12`]: 260,
    [`${API_INSTANCE_COUNT_KEY}:24`]: 620,
    [`${API_INSTANCE_COUNT_KEY}:48`]: 1_300,
    [`${REFRESH_CONCURRENCY_LIMIT_KEY}:20`]: 0,
    [`${REFRESH_CONCURRENCY_LIMIT_KEY}:50`]: 40,
    [`${REFRESH_CONCURRENCY_LIMIT_KEY}:100`]: 110,
    [`${REFRESH_CONCURRENCY_LIMIT_KEY}:400`]: 320,
  },
};

/**
 * Full recovery: origin QPS and failure rate are both back to
 * steady-state and origin is no longer in a warning/critical status.
 * Reachable identically via jitter, single-flight coalescing, or
 * stale-while-revalidate — see definition.ts's completion-mode audit
 * for why none of the three deserves a separate tier (all three reach
 * the same genuinely safe, non-recurring state).
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "originQps", operator: "less_than_or_equal", comparedTo: 150 },
    { key: "refreshFailureRatePct", operator: "less_than_or_equal", comparedTo: 2 },
    { key: "originStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "originStatus", operator: "not_equals", comparedTo: "warning" },
  ],
  sustainedSeconds: 20,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "originQps", operator: "greater_than_or_equal", comparedTo: 9_000 }],
  sustainedSeconds: 45,
};
