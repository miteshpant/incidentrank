import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CACHE_PROTECTION_KEY, DB_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "uncapped-failover-overloads-bc": 1_200,
  "failover-active-unmanaged": 900,
  "cap-too-low-drops-critical-traffic": 700,
  "cap-zero-drops-all-critical-traffic": 950,
  "capacity-managed-partial-protection": 250,
  "capacity-managed-full-protection": 90,
  "restore-instant-retrigger": 1_000,
  "restore-gradual-before-drain-pending": 180,
  "restore-gradual-after-drain-safe": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 600,
  perUnitMonthlyUsd: {
    [`${CACHE_PROTECTION_KEY}:on`]: 60,
    [`${DB_CONCURRENCY_KEY}:capped`]: 40,
  },
};

/**
 * Full recovery: Region B/C are carrying no second-region risk
 * (secondRegionRiskStatus === "normal"), no critical traffic is being
 * dropped (regionACriticalTrafficDroppedPct === 0), and the global
 * success rate has returned to a genuinely healthy level. Gated directly
 * on the two correctness/safety fields rather than on availability alone
 * -- a state where Region B/C read 100% success themselves but real
 * critical traffic is being silently dropped elsewhere (cap-too-low/
 * cap-zero) can never satisfy this, and neither can the uncapped-failover
 * trap where secondRegionRiskStatus is critical.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "secondRegionRiskStatus", operator: "equals", comparedTo: "normal" },
    { key: "regionACriticalTrafficDroppedPct", operator: "equals", comparedTo: 0 },
    { key: "globalSuccessRate", operator: "greater_than_or_equal", comparedTo: 88 },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable: Region B/C are not at second-region risk and no critical
 * traffic is being dropped, but global success is lower than the fully
 * safe bar -- the genuinely safe-but-imperfect "partial regional loss
 * accepted, one protection tier left engaged" tier (capacity-managed-
 * partial-protection), where Region A stays offline and one of
 * cache-protection/DB-concurrency is still unprotected, producing visible
 * but non-critical stress.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "secondRegionRiskStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "regionACriticalTrafficDroppedPct", operator: "equals", comparedTo: 0 },
    { key: "globalSuccessRate", operator: "greater_than_or_equal", comparedTo: 80 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: Region B and/or Region C have been driven into sustained
 * critical second-region risk -- the exact outcome the business
 * invariant "healthy regions must not be driven into failure" exists to
 * prevent. A long enough window of secondRegionRiskStatus === "critical"
 * means the mitigation (or lack of one) has genuinely converted a
 * single-region incident into a second regional failure, not merely
 * degraded performance.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "secondRegionRiskStatus", operator: "equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 90,
};
