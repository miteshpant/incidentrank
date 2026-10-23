import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // How many sides currently believe they hold write leadership. 1 is
  // the only safe value; 2 means both regions believe they are
  // authoritative at the same time (the defining symptom of split
  // brain).
  leaderCount: 1,
  // Writes accepted per minute, per region, while partitioned. Used
  // only for candidate-visible traffic-shape context; the real
  // correctness signal is divergentWriteCount/conflictCount below, not
  // this.
  writesPerRegionA: 40,
  writesPerRegionB: 40,
  // Direct, authored evidence that writes have actually diverged between
  // the two regions as a result of both sides accepting writes without a
  // shared quorum view. Zero is the only safe value. This is the
  // correctness field successCondition gates on directly — it stays
  // nonzero for as long as both regions are accepting writes during a
  // partition, no matter how healthy customer-facing availability reads
  // in both regions.
  divergentWriteCount: 0,
  // Count of writes that landed in actual conflict (same key, different
  // values, from both regions) and have not yet been reconciled. Zero is
  // the only safe value once the partition has healed; nonzero while the
  // partition is active AND both sides are writable.
  conflictCount: 0,
  // Whether more than one region is simultaneously accepting writes
  // right now. "dual" is the unsafe value; "single" means exactly one
  // region (or neither) is currently writable.
  writeAuthorityState: "single",
  // Customer-facing write availability, per region, 0-100. Can read
  // 100 in BOTH regions at the same time that writeAuthorityState is
  // "dual" and conflictCount is climbing -- that combination is exactly
  // the trap this scenario is built to catch.
  regionAWriteAvailability: 100,
  regionBWriteAvailability: 100,
  // Whether the network partition between the two regions is currently
  // healed. "partitioned" while the split is active; "healed" once
  // connectivity returns, at which point reconciliationPolicy begins to
  // matter.
  partitionState: "partitioned",
  // Count of divergent writes still awaiting reconciliation after the
  // partition heals. Only relevant once partitionState is "healed";
  // zero means reconciliation has fully caught up.
  unreconciledWriteCount: 0,
  // Severity field (exactly "normal"|"warning"|"critical", per
  // SeverityFieldConfig) tracking the coordinator's own assessment of
  // how dangerous the current write-authority state is -- distinct
  // from writeAuthorityState/partitionState, whose value sets are not
  // the normal/warning/critical enum. "critical" only while both
  // regions are genuinely, simultaneously writable; "warning" while
  // safe-but-imperfect (wrong-region fence, needlessly conservative
  // both-isolated, or a real unresolved post-heal reconciliation
  // backlog); "normal" for every genuinely optimal single-writer
  // state. Drives totalTimeInCriticalMs/totalTimeInDegradedMs (and
  // therefore Reliability scoring's criticalTimeRatio) generically via
  // the engine's own severityRank bookkeeping -- never scenario-
  // specific scorer code.
  coordinatorStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Missing Database
  // Index's orderHistoryQueryHealth / Distributed Lock Failure's
  // lockSafetyMechanism) recording HOW single-writer safety is
  // currently being maintained, not merely whether it currently holds.
  // "quorum-enforced" = the durable, structural fix: a real majority
  // requirement means at most one side can ever stay writable during
  // any future partition too, with no manual judgment call required.
  // "fenced-correct" = the candidate correctly, explicitly fenced the
  // non-majority side. "fenced-wrong" = the candidate explicitly fenced
  // the side that structurally held majority, sacrificing availability
  // on the wrong side for no correctness benefit. "manual-isolation" =
  // safe only because the candidate happened to manually set the other
  // region's access mode to read-only/offline -- correct right now, but
  // not backed by a structural guarantee against a future partition.
  // "both-isolated" = safe but needlessly conservative (zero write
  // availability anywhere). "unresolved" = no safety mechanism has
  // engaged; either healthy, or both regions are actively writable.
  // Read only by scoring's dataIntegrity-adjacent measure, never by any
  // scenario-specific scorer code.
  writeSafetyMechanism: "unresolved",
};
