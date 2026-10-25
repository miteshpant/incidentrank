import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CHALLENGE_POLICY_KEY, TRAFFIC_SAMPLING_ENABLED_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "bot-surge-escalated": 900,
  "bot-surge-rising": 620,
  "coarse-blocked-high-collateral": 520,
  "strict-limit-collateral": 320,
  "coarse-challenge-bounded": 220,
  "targeting-without-signal": 150,
  "cache-absorbing-partial": 110,
  "tenant-quota-partial": 70,
  "targeted-recovered": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${CHALLENGE_POLICY_KEY}:off`]: 0,
    [`${CHALLENGE_POLICY_KEY}:light`]: 80,
    [`${CHALLENGE_POLICY_KEY}:aggressive`]: 180,
    [`${TRAFFIC_SAMPLING_ENABLED_KEY}:true`]: 140,
  },
};

/**
 * Full recovery: defenseMode === "targeted" directly gates success,
 * excluded from the backend/customer-metric conditions on purpose — a
 * state could otherwise look "healthy" on backendLoadPct alone while
 * actually being the high-collateral coarse-blocking path, which is the
 * real correctness-adjacent trap this scenario tests (mirrors Split-Brain
 * Incident's writeAuthorityState gating pattern: never let an
 * availability-shaped metric alone satisfy success when a distinct
 * safety/fairness field exists to check directly). falsePositiveRatePct
 * is checked explicitly too so a future rule change to defenseMode can
 * never silently satisfy success without the real customer-harm signal
 * also being low.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "backendLoadPct", operator: "less_than_or_equal", comparedTo: 35 },
    { key: "falsePositiveRatePct", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "trafficStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "defenseMode", operator: "equals", comparedTo: "targeted" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "backendLoadPct", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
