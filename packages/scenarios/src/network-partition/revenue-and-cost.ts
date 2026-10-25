import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { LEDGER_WRITE_ROUTING_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  // The trap state: customer-facing availability reads 100 in BOTH
  // regions, so this scenario deliberately does NOT model heavy revenue
  // loss here from an availability standpoint -- the real cost is the
  // ledger correctness damage, carried by Data Integrity scoring and the
  // gated successCondition, not by an availability-driven revenue number
  // that would otherwise make this state look "cheap" the same way it
  // looks "healthy."
  "dual-ledger-write-trap": 150,
  "healed-ledger-violations-persist": 400,
  "healed-safe": 0,
  "single-region-routed-a": 60,
  "single-region-routed-a-strict": 90,
  "single-region-routed-a-strong-profile": 110,
  "single-region-routed-b": 60,
  "single-region-routed-b-strict": 90,
  "region-a-isolated-manual": 180,
  "region-b-isolated-manual": 180,
  "both-regions-isolated": 900,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 450,
  perUnitMonthlyUsd: {
    [`${LEDGER_WRITE_ROUTING_KEY}:single-region-authoritative`]: 0,
    [`${LEDGER_WRITE_ROUTING_KEY}:local-region-authoritative`]: 0,
  },
};

/**
 * Full recovery: ledger write authority is held by exactly one region
 * (ledgerWriteAuthority === "single") AND there are zero outstanding
 * ledger consistency violations (ledgerConsistencyViolationCount === 0).
 * This is the direct, authored correctness gate: a state where both
 * regions remain ledger-writable (ledgerWriteAuthority === "dual") can
 * NEVER satisfy this, regardless of how healthy regionAAvailability/
 * regionBAvailability read -- those two customer-facing availability
 * fields are deliberately absent from this condition.
 * ledgerConsistencyViolationCount === 0 additionally rules out the
 * post-heal state that still carries a real, unresolved violation count
 * from an earlier unsafe window (healed-ledger-violations-persist) --
 * genuinely safer than the active dual-write trap (no NEW divergence is
 * being created) but still carries real, counted, unresolved damage, so
 * it does not count as fully recovered either.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "ledgerWriteAuthority", operator: "equals", comparedTo: "single" },
    { key: "ledgerConsistencyViolationCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: a sustained run of severe, ongoing ledger divergence -- both
 * regions have been simultaneously ledger-writable long enough to
 * accumulate a large number of real conflicting balance-affecting writes
 * with no sign of being reined in.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "ledgerConsistencyViolationCount", operator: "greater_than_or_equal", comparedTo: 20 },
    { key: "ledgerWriteAuthority", operator: "equals", comparedTo: "dual" },
  ],
  sustainedSeconds: 60,
};
