import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { BURST_SIZE_KEY, GLOBAL_QUOTA_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "domination-deepening": 900,
  "global-quota-raised-alone": 650,
  "policy-misconfigured": 560,
  "rolled-back-burst-open": 340,
  "burst-tightened-quota-tight": 420,
  "quota-raised-burst-open": 220,
  "priority-favored-steady": 60,
  // The bypass trap deliberately carries only a modest revenue number —
  // customer-facing success looks healthy under bypass, so the real
  // cost here is the lost fairness protection, carried by Data
  // Integrity scoring and the gated successCondition, never by an
  // availability-driven revenue figure that would otherwise make this
  // state look "cheap" the same way it looks "healthy."
  "bypass-unprotected": 40,
  "retuned-fair": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${GLOBAL_QUOTA_KEY}:5000`]: 0,
    [`${GLOBAL_QUOTA_KEY}:10000`]: 0,
    [`${GLOBAL_QUOTA_KEY}:20000`]: 260,
    [`${BURST_SIZE_KEY}:50`]: 0,
    [`${BURST_SIZE_KEY}:200`]: 0,
    [`${BURST_SIZE_KEY}:800`]: 0,
    [`${BURST_SIZE_KEY}:2000`]: 0,
  },
};

/**
 * Full recovery: rateLimitStatus must be "protected" — this alone rules
 * out the bypass trap no matter how healthy customerSuccessRate or
 * rejectionRate read under it. On top of that, both halves of the real
 * misconfiguration must actually be fixed: legitimate tenants recovered
 * (legitimateTenantSuccessRate) and the dominant tenant's share capped
 * back down (bursterShareOfCapacity) — not just one or the other.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "rateLimitStatus", operator: "equals", comparedTo: "protected" },
    { key: "legitimateTenantSuccessRate", operator: "greater_than_or_equal", comparedTo: 95 },
    { key: "bursterShareOfCapacity", operator: "less_than_or_equal", comparedTo: 20 },
  ],
  sustainedSeconds: 20,
};

/**
 * Acceptable handback: rateLimitStatus must still be "protected" (the
 * bypass trap can never qualify here either). Legitimate tenants are
 * recovering well, but the dominant tenant's share is only genuinely
 * controlled, not fully optimal — the priority-class alternate path's
 * real, authored tradeoff: legitimate traffic is protected, fairness is
 * improved but not airtight.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "rateLimitStatus", operator: "equals", comparedTo: "protected" },
    { key: "legitimateTenantSuccessRate", operator: "greater_than_or_equal", comparedTo: 95 },
    { key: "bursterShareOfCapacity", operator: "less_than_or_equal", comparedTo: 40 },
  ],
  sustainedSeconds: 20,
};

/**
 * Failure: a sustained run of severe, ongoing throttling of legitimate
 * traffic with no sign of being reined in — the dominant tenant has
 * taken over nearly all shared capacity.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "legitimateTenantSuccessRate", operator: "less_than_or_equal", comparedTo: 50 },
  ],
  sustainedSeconds: 60,
};
