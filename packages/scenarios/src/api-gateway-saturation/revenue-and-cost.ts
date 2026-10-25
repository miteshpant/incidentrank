import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { BACKEND_CAPACITY_KEY, GATEWAY_CAPACITY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "connection-pool-exhausted": 700,
  "backend-scaled-no-relief": 620,
  "gateway-saturating": 580,
  "gateway-scaled-partial": 220,
  "route-simplified-partial": 190,
  "connection-reuse-partial": 170,
  "rate-limited-partial": 230,
  "auth-bypassed": 0,
  "lightweight-auth-recovery": 0,
  "gateway-fixed": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${GATEWAY_CAPACITY_KEY}:2`]: 0,
    [`${GATEWAY_CAPACITY_KEY}:4`]: 180,
    [`${GATEWAY_CAPACITY_KEY}:8`]: 460,
    [`${GATEWAY_CAPACITY_KEY}:16`]: 980,
    [`${BACKEND_CAPACITY_KEY}:6`]: 0,
    [`${BACKEND_CAPACITY_KEY}:12`]: 160,
    [`${BACKEND_CAPACITY_KEY}:24`]: 420,
    [`${BACKEND_CAPACITY_KEY}:48`]: 980,
  },
};

/**
 * Full recovery: gateway CPU/queue/customer latency are all genuinely
 * healthy AND gatewaySaturationHealth === "fixed" — the per-request
 * overhead (connection churn and/or route-matching cost and/or
 * auth-introspection cost) was actually removed, not merely masked.
 * Gating on gatewaySaturationHealth rather than only the numeric
 * metrics is deliberate: disabling authentication entirely
 * (authMiddlewareMode=bypass) ALSO drives every numeric metric back to
 * healthy, but that state sets gatewaySaturationHealth = "bypassed",
 * never "fixed" — see this file's completion-mode audit in
 * definition.ts for why that state must never be eligible for any
 * Finish tier, not even "acceptable."
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "gatewayCpuUtilization", operator: "less_than_or_equal", comparedTo: 35 },
    { key: "gatewayStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "gatewaySaturationHealth", operator: "equals", comparedTo: "fixed" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "gatewayCpuUtilization", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
