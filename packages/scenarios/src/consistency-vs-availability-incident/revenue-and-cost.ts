import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { WRITE_ROUTING_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  // The trap state: balance write availability reads 100, so this
  // scenario deliberately does NOT model heavy revenue loss here from an
  // availability standpoint -- the real cost is the correctness damage,
  // carried by Data Integrity scoring and the gated successCondition,
  // never by a revenue number that would otherwise make this state look
  // "cheap" the same way it looks "healthy."
  "balance-relaxed-unsafe": 120,
  "balance-quorum-misconfigured": 120,
  "both-strong-queue": 300,
  "both-strong-reject": 340,
  "differentiated-balance-strong-catalog-relaxed": 160,
  "single-region-a-routed": 90,
  "single-region-b-routed": 90,
  "healed-balance-queue-draining": 40,
  "healed-catalog-reconciled-lww": 10,
  "healed-catalog-reconciling-merge": 20,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${WRITE_ROUTING_KEY}:both-regions`]: 0,
    [`${WRITE_ROUTING_KEY}:single-region-a`]: 0,
    [`${WRITE_ROUTING_KEY}:single-region-b`]: 0,
  },
};

/**
 * Full recovery: zero balance correctness violations
 * (balanceCorrectnessViolations === 0) AND balance write availability
 * is not collapsed to zero (balanceWriteAvailability greater than 0 --
 * i.e. some durable, differentiated or fully-safe handling is in effect,
 * not merely "every write everywhere rejected"). This is the direct,
 * authored correctness gate: balanceWriteAvailability alone can NEVER
 * satisfy this on its own -- the relaxed-unsafe and quorum-misconfigured
 * trap states both read balanceWriteAvailability === 100 while
 * balanceCorrectnessViolations is nonzero, and that field is deliberately
 * absent from any role here beyond the floor check. catalogWriteAvailability/
 * catalogStalenessSeconds are deliberately absent entirely: this condition
 * never requires catalog availability or freshness to be healthy, because
 * relaxing catalog consistency is never a correctness violation for this
 * business.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "balanceCorrectnessViolations", operator: "equals", comparedTo: 0 },
    { key: "balanceWriteAvailability", operator: "greater_than", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: a sustained run of severe, ongoing balance correctness
 * violations -- the relaxed/misconfigured trap left in place long enough
 * to accumulate a large number of real conflicting balance writes with
 * no sign of being reined in.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "balanceCorrectnessViolations", operator: "greater_than_or_equal", comparedTo: 9 },
  ],
  sustainedSeconds: 90,
};
