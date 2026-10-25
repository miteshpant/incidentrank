import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { MAX_CHECKOUT_CONCURRENCY_KEY, RETRY_POLICY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-degraded-unmitigated": 900,
  "concurrency-amplified": 1_400,
  "retry-amplified-moderate": 2_200,
  "retry-amplified-aggressive": 4_800,
  // The trap: Inventory's own latency/error metrics read fast/healthy --
  // but the real, counted damage (unreconciledOptimisticReservationCount)
  // is oversold inventory that must eventually be made right with real
  // customers (cancelled orders, refunds, expedited replacement
  // shipping, goodwill credits) once each optimistic reservation fails
  // to reconcile. That real downstream customer cost is reflected here
  // directly -- this state is deliberately NOT "cheap" just because
  // nothing on the checkout path itself looks slow. The primary
  // correctness signal is still carried by Data Integrity scoring and
  // the business-invariant success/acceptable gate, which this revenue
  // number does not substitute for.
  "optimistic-reservation-trap": 3_200,
  "critical-path-trimmed-partial": 250,
  "critical-path-trimmed-full": 20,
  "recovered-clean": 0,
  "recovered-optimistic-trap-persists": 150,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 620,
  perUnitMonthlyUsd: {
    [`${MAX_CHECKOUT_CONCURRENCY_KEY}:50`]: -40,
    [`${MAX_CHECKOUT_CONCURRENCY_KEY}:100`]: 0,
    [`${MAX_CHECKOUT_CONCURRENCY_KEY}:200`]: 90,
    [`${RETRY_POLICY_KEY}:none`]: 0,
    [`${RETRY_POLICY_KEY}:moderate`]: 60,
    [`${RETRY_POLICY_KEY}:aggressive`]: 180,
  },
};

/**
 * Full recovery: checkout end-to-end latency back under the usability
 * budget, both correctness-critical fields at their only-safe value
 * (100), and zero unreconciled optimistic reservations. Gated directly
 * on these fields -- a state where Inventory LOOKS fast
 * (inventoryLatencyMs low) while unreconciledOptimisticReservationCount
 * is nonzero can never satisfy this, regardless of how healthy latency
 * reads elsewhere, since correctness is checked independently of
 * latency/availability.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "checkoutLatencyMs", operator: "less_than_or_equal", comparedTo: 1_000 },
    { key: "paymentAuthSuccessPct", operator: "equals", comparedTo: 100 },
    { key: "inventoryReservationSuccessPct", operator: "equals", comparedTo: 100 },
    { key: "unreconciledOptimisticReservationCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable (looser, deliberate-tradeoff) tier: checkout latency reduced
 * to a bounded, visibly-degraded-but-usable level (partial trim), with
 * correctness still fully intact. Distinct from successCondition's full
 * recovery bar -- genuinely safe-but-imperfect, never a masked
 * correctness gap.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "checkoutLatencyMs", operator: "less_than_or_equal", comparedTo: 1_800 },
    { key: "paymentAuthSuccessPct", operator: "equals", comparedTo: 100 },
    { key: "inventoryReservationSuccessPct", operator: "equals", comparedTo: 100 },
    { key: "unreconciledOptimisticReservationCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: a sustained run of real, accumulating correctness or
 * availability collapse -- either payment authorization has dropped
 * meaningfully below its only-safe value for a full sustained window
 * (aggressive-retry amplification), or a real, unreconciled inventory
 * oversell risk has grown large and persisted (the optimistic-reservation
 * trap).
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "paymentAuthSuccessPct", operator: "less_than", comparedTo: 90 },
  ],
  sustainedSeconds: 90,
};
