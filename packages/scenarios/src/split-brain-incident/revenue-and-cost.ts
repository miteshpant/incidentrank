import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { QUORUM_REQUIREMENT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  // The trap state: customer-facing write availability reads 100 in
  // BOTH regions, so this scenario deliberately does NOT model heavy
  // revenue loss here from an availability standpoint -- the real cost
  // is the correctness damage, carried by Data Integrity scoring and
  // the gated successCondition, not by a availability-driven revenue
  // number that would otherwise make this state look "cheap" the same
  // way it looks "healthy."
  "dual-leader-both-writable": 150,
  "fenced-region-a": 600,
  "both-regions-write-disabled": 1_200,
  "healed-reconciling-defer": 80,
  "healed-awaiting-manual-review": 120,
  "healed-reconciled-lww": 20,
  "majority-quorum-enforced": 150,
  "manual-single-writer-region-a": 150,
  "manual-single-writer-region-b": 150,
  "fenced-region-b": 150,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 400,
  perUnitMonthlyUsd: {
    [`${QUORUM_REQUIREMENT_KEY}:majority`]: 0,
    [`${QUORUM_REQUIREMENT_KEY}:any-single-region`]: 0,
  },
};

/**
 * Full recovery: exactly one region currently holds write authority
 * (writeAuthorityState === "single") AND there are zero outstanding
 * divergent/conflicting writes (conflictCount === 0). This is the
 * direct, authored correctness gate: a state where both regions remain
 * writable (writeAuthorityState === "dual") can NEVER satisfy this,
 * regardless of how healthy regionAWriteAvailability/
 * regionBWriteAvailability read -- those two customer-facing
 * availability fields are deliberately absent from this condition.
 * conflictCount === 0 additionally rules out the post-heal states that
 * still carry an unresolved reconciliation backlog (healed-reconciling-
 * defer, healed-awaiting-manual-review) -- those are genuinely safer
 * than the active dual-leader trap (no NEW divergence is being created)
 * but still have real, counted, unresolved conflicts sitting in the
 * system, so they do not count as fully recovered either.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "writeAuthorityState", operator: "equals", comparedTo: "single" },
    { key: "conflictCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 15,
};

/**
 * Failure: a sustained run of severe, ongoing divergence -- both
 * regions have been simultaneously writable long enough to accumulate
 * a large number of real conflicting writes with no sign of being
 * reined in.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "conflictCount", operator: "greater_than_or_equal", comparedTo: 12 },
    { key: "writeAuthorityState", operator: "equals", comparedTo: "dual" },
  ],
  sustainedSeconds: 60,
};
