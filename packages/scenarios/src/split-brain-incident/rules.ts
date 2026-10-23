import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  FENCING_ACTION_KEY,
  QUORUM_REQUIREMENT_KEY,
  RECONCILIATION_POLICY_KEY,
  REGION_A_ACCESS_KEY,
  REGION_B_ACCESS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "region-a": "healthy",
  coordinator: "healthy",
  "region-b": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "region-a": "degraded",
  coordinator: "degraded",
  "region-b": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "region-a": "critical",
  coordinator: "critical",
  "region-b": "critical",
};

// Region A isolated/degraded (fenced, read-only, or offline) while
// Region B carries the write load alone.
const regionAIsolatedHealth: Record<string, ComponentHealth> = {
  "region-a": "degraded",
  coordinator: "healthy",
  "region-b": "healthy",
};

// Region B isolated/degraded while Region A carries the write load alone.
const regionBIsolatedHealth: Record<string, ComponentHealth> = {
  "region-a": "healthy",
  coordinator: "healthy",
  "region-b": "degraded",
};

// Both regions deliberately taken off the write path (fully safe, fully
// unavailable for writes anywhere).
const bothIsolatedHealth: Record<string, ComponentHealth> = {
  "region-a": "degraded",
  coordinator: "degraded",
  "region-b": "degraded",
};

/**
 * Authored rule table for Split-Brain Incident, ordered most-specific
 * first.
 *
 * During the partition, each region's write-access mode
 * (regionAAccessMode / regionBAccessMode) and the quorum requirement
 * together decide whether both sides can simultaneously accept writes.
 * The coordinator is modeled as holding a tiebreaking vote that Region A
 * structurally holds a real majority with (2 of 3 coordinator votes) —
 * a concrete, deterministic stand-in for "quorum requires a real
 * majority, and in a 2-region partition only one side can ever have
 * one." This is why enforcing quorumRequirement="majority" alone is
 * sufficient to prevent dual-leader writes even with both regions left
 * in "read-write" mode: Region B's local quorum check fails and it steps
 * back on its own, without needing explicit fencing.
 *
 * fencingAction is an explicit, immediate override independent of
 * quorum: it forces a NAMED region down regardless of what quorum would
 * otherwise decide. Fencing the side that structurally holds majority
 * (Region A) is actively harmful -- it sacrifices the side that could
 * have stayed safely available while doing nothing to stop a
 * non-majority side that was never going to win quorum anyway.
 *
 * The critical trap this scenario exists to catch: both regions left in
 * "read-write" mode with quorumRequirement left at the default
 * "any-single-region" setting. Each region's local availability reads
 * 100 (regionAWriteAvailability / regionBWriteAvailability) -- a
 * candidate watching only customer-facing availability sees two fully
 * healthy regions. divergentWriteCount and conflictCount are the real,
 * authored, rising evidence that this is not actually safe:
 * writeAuthorityState="dual" and leaderCount=2 are also directly
 * observable the entire time. This state must never satisfy
 * successCondition or any acceptableCondition, however healthy
 * availability looks.
 */
export const splitBrainIncidentRules: Rule[] = [
  // ── Post-heal reconciliation states (networkHealed=true). Checked
  // first since networkHealed implies networkPartitioned was also set
  // by the same/earlier timed event, so these must win over the
  // partition-era rules below whenever healing has actually occurred.
  //
  // Backlog from an UNSAFE dual-writable window during the partition,
  // now being reconciled. "defer-until-healed" holds every divergent
  // write for structured reconciliation -- no write is silently
  // discarded, but the backlog clears more slowly while under review.
  {
    id: "healed-reconciling-defer",
    when: {
      triggerEquals: { networkHealed: true },
      controlEquals: { [RECONCILIATION_POLICY_KEY]: "defer-until-healed" },
    },
    incidentState: "healed-reconciling-defer",
    values: {
      leaderCount: 1,
      writesPerRegionA: 40,
      writesPerRegionB: 40,
      divergentWriteCount: 46,
      conflictCount: 12,
      writeAuthorityState: "single",
      regionAWriteAvailability: 100,
      regionBWriteAvailability: 100,
      partitionState: "healed",
      unreconciledWriteCount: 12,
      writeSafetyMechanism: "unresolved",
      coordinatorStatus: "warning",
    },
    componentHealth: degradedHealth,
  },
  // "last-write-wins" converges the backlog immediately by timestamp --
  // fast, but it is a real, authored choice to resolve every conflict
  // by discarding whichever write lost the timestamp race, rather than
  // having a human look at it.
  {
    id: "healed-reconciling-last-write-wins",
    when: {
      triggerEquals: { networkHealed: true },
      controlEquals: { [RECONCILIATION_POLICY_KEY]: "last-write-wins" },
    },
    incidentState: "healed-reconciled-lww",
    values: {
      leaderCount: 1,
      writesPerRegionA: 40,
      writesPerRegionB: 40,
      divergentWriteCount: 46,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 100,
      regionBWriteAvailability: 100,
      partitionState: "healed",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "unresolved",
      coordinatorStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
  // "manual-review" blocks every conflicting key from auto-converging
  // until a human inspects it -- conflictCount stays elevated (visibly
  // unresolved) until that review happens, the slowest option but the
  // one that discards nothing silently.
  {
    id: "healed-reconciling-manual-review",
    when: {
      triggerEquals: { networkHealed: true },
      controlEquals: { [RECONCILIATION_POLICY_KEY]: "manual-review" },
    },
    incidentState: "healed-awaiting-manual-review",
    values: {
      leaderCount: 1,
      writesPerRegionA: 40,
      writesPerRegionB: 40,
      divergentWriteCount: 46,
      conflictCount: 12,
      writeAuthorityState: "single",
      regionAWriteAvailability: 100,
      regionBWriteAvailability: 100,
      partitionState: "healed",
      unreconciledWriteCount: 12,
      writeSafetyMechanism: "unresolved",
      coordinatorStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partition-era states (networkPartitioned=true, networkHealed
  // not yet set). Ordered most-specific first.

  // ── OPTIMAL: explicit fencing of a region makes it unambiguous and
  // immediate which single side remains authoritative, independent of
  // quorum and independent of each region's access-mode control --
  // this wins over every access-mode-driven rule below whenever fencing
  // is active, since it is the fastest, most explicit stop mechanism.
  // Fencing Region B (the structurally non-majority side) is the fully
  // safe choice: Region A keeps serving writes at full availability
  // while Region B is cleanly taken off the write path.
  {
    id: "fenced-region-b-safe",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: { [FENCING_ACTION_KEY]: "fence-region-b" },
    },
    incidentState: "fenced-region-b",
    values: {
      leaderCount: 1,
      writesPerRegionA: 40,
      writesPerRegionB: 0,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 100,
      regionBWriteAvailability: 0,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "fenced-correct",
      coordinatorStatus: "normal",
    },
    componentHealth: regionBIsolatedHealth,
  },

  // ── UNSAFE-by-choice but not corrupt: fencing Region A sacrifices the
  // structurally-majority side's availability for no correctness
  // benefit -- Region B, which was never going to hold real quorum
  // anyway, is left as the sole writer. Zero correctness violations
  // (only one side writes), but this is the wrong region to have
  // fenced: a real, visible, avoidable availability cost on the side
  // that could have stayed up.
  {
    id: "fenced-wrong-region-a",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: { [FENCING_ACTION_KEY]: "fence-region-a" },
    },
    incidentState: "fenced-region-a",
    values: {
      leaderCount: 1,
      writesPerRegionA: 0,
      writesPerRegionB: 40,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 0,
      regionBWriteAvailability: 100,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "fenced-wrong",
      coordinatorStatus: "warning",
    },
    componentHealth: regionAIsolatedHealth,
  },

  // ── OPTIMAL: majority quorum enforced, both regions otherwise left
  // in read-write mode. Region A structurally holds the coordinator's
  // real majority (2 of 3 votes); Region B's own quorum check fails
  // during the partition and it steps back to read-only on its own,
  // with no explicit fencing action needed. This is the clean,
  // structural fix: it costs Region B's write availability (a real,
  // visible cost), but it is the only lever that is itself sufficient
  // to prevent dual-leader writes without the candidate having to
  // correctly guess which single region to fence by hand.
  {
    id: "majority-quorum-enforced",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [QUORUM_REQUIREMENT_KEY]: "majority",
        [REGION_A_ACCESS_KEY]: "read-write",
        [REGION_B_ACCESS_KEY]: "read-write",
      },
    },
    incidentState: "majority-quorum-enforced",
    values: {
      leaderCount: 1,
      writesPerRegionA: 40,
      writesPerRegionB: 0,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 100,
      regionBWriteAvailability: 0,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "quorum-enforced",
      coordinatorStatus: "normal",
    },
    componentHealth: regionBIsolatedHealth,
  },

  // ── OPTIMAL: candidate manually sets exactly one region to read-write
  // and the other to read-only/offline (no fencing action needed,
  // quorum requirement irrelevant since only one side can possibly
  // write). Region A kept writable. Explicitly requires Region B to be
  // read-only or offline (two separate rules below, rather than a
  // single wildcard) so this can never shadow the dual-writable trap
  // rule further below when Region B is ALSO left read-write.
  {
    id: "manual-single-writer-region-a-ro-b",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [REGION_A_ACCESS_KEY]: "read-write",
        [REGION_B_ACCESS_KEY]: "read-only",
      },
    },
    incidentState: "manual-single-writer-region-a",
    values: {
      leaderCount: 1,
      writesPerRegionA: 40,
      writesPerRegionB: 0,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 100,
      regionBWriteAvailability: 0,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "manual-isolation",
      coordinatorStatus: "normal",
    },
    componentHealth: regionBIsolatedHealth,
  },
  {
    id: "manual-single-writer-region-a-offline-b",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [REGION_A_ACCESS_KEY]: "read-write",
        [REGION_B_ACCESS_KEY]: "offline",
      },
    },
    incidentState: "manual-single-writer-region-a",
    values: {
      leaderCount: 1,
      writesPerRegionA: 40,
      writesPerRegionB: 0,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 100,
      regionBWriteAvailability: 0,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "manual-isolation",
      coordinatorStatus: "normal",
    },
    componentHealth: regionBIsolatedHealth,
  },
  // Mirror: Region B kept as the sole writer (Region A manually set to
  // read-only/offline). Equally safe -- the choice of WHICH side stays
  // up is a business/latency decision, not a correctness one, as long
  // as exactly one side remains writable.
  {
    id: "manual-single-writer-region-b",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [REGION_A_ACCESS_KEY]: "read-only",
        [REGION_B_ACCESS_KEY]: "read-write",
      },
    },
    incidentState: "manual-single-writer-region-b",
    values: {
      leaderCount: 1,
      writesPerRegionA: 0,
      writesPerRegionB: 40,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 0,
      regionBWriteAvailability: 100,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "manual-isolation",
      coordinatorStatus: "normal",
    },
    componentHealth: regionAIsolatedHealth,
  },
  {
    id: "manual-single-writer-region-b-offline-a",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [REGION_A_ACCESS_KEY]: "offline",
        [REGION_B_ACCESS_KEY]: "read-write",
      },
    },
    incidentState: "manual-single-writer-region-b",
    values: {
      leaderCount: 1,
      writesPerRegionA: 0,
      writesPerRegionB: 40,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 0,
      regionBWriteAvailability: 100,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "manual-isolation",
      coordinatorStatus: "normal",
    },
    componentHealth: regionAIsolatedHealth,
  },

  // ── Both regions deliberately taken off the write path entirely
  // (every combination of read-only/offline on both sides). Fully safe
  // -- zero divergent writes, because nobody is writing anywhere -- but
  // an overly conservative choice: the candidate sacrificed ALL write
  // availability when at least one side could have safely stayed up.
  // Four explicit rules (one per read-only/offline combination) rather
  // than a single wildcard match, keeping every authored consequence a
  // direct, honest mapping of what's authored.
  {
    id: "both-regions-write-disabled-ro-ro",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [REGION_A_ACCESS_KEY]: "read-only",
        [REGION_B_ACCESS_KEY]: "read-only",
      },
    },
    incidentState: "both-regions-write-disabled",
    values: {
      leaderCount: 0,
      writesPerRegionA: 0,
      writesPerRegionB: 0,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 0,
      regionBWriteAvailability: 0,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "both-isolated",
      coordinatorStatus: "warning",
    },
    componentHealth: bothIsolatedHealth,
  },
  {
    id: "both-regions-write-disabled-ro-offline",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [REGION_A_ACCESS_KEY]: "read-only",
        [REGION_B_ACCESS_KEY]: "offline",
      },
    },
    incidentState: "both-regions-write-disabled",
    values: {
      leaderCount: 0,
      writesPerRegionA: 0,
      writesPerRegionB: 0,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 0,
      regionBWriteAvailability: 0,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "both-isolated",
      coordinatorStatus: "warning",
    },
    componentHealth: bothIsolatedHealth,
  },
  {
    id: "both-regions-write-disabled-offline-ro",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [REGION_A_ACCESS_KEY]: "offline",
        [REGION_B_ACCESS_KEY]: "read-only",
      },
    },
    incidentState: "both-regions-write-disabled",
    values: {
      leaderCount: 0,
      writesPerRegionA: 0,
      writesPerRegionB: 0,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 0,
      regionBWriteAvailability: 0,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "both-isolated",
      coordinatorStatus: "warning",
    },
    componentHealth: bothIsolatedHealth,
  },
  {
    id: "both-regions-write-disabled-offline-offline",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [REGION_A_ACCESS_KEY]: "offline",
        [REGION_B_ACCESS_KEY]: "offline",
      },
    },
    incidentState: "both-regions-write-disabled",
    values: {
      leaderCount: 0,
      writesPerRegionA: 0,
      writesPerRegionB: 0,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 0,
      regionBWriteAvailability: 0,
      partitionState: "partitioned",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "both-isolated",
      coordinatorStatus: "warning",
    },
    componentHealth: bothIsolatedHealth,
  },

  // ── THE TRAP: both regions left in "read-write" mode, quorum
  // requirement left at "any-single-region", no fencing applied. Each
  // side's own local view says it holds leadership, so both accept
  // writes. regionAWriteAvailability and regionBWriteAvailability both
  // read 100 -- customer-facing write availability looks fully healthy
  // in BOTH regions at once. leaderCount=2 and writeAuthorityState=
  // "dual" are the directly observable symptom; divergentWriteCount and
  // conflictCount are the directly observable, rising, real correctness
  // damage. This state must never satisfy successCondition or any
  // acceptableCondition, no matter how healthy availability reads.
  {
    id: "dual-leader-both-writable",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [FENCING_ACTION_KEY]: "none",
        [QUORUM_REQUIREMENT_KEY]: "any-single-region",
        [REGION_A_ACCESS_KEY]: "read-write",
        [REGION_B_ACCESS_KEY]: "read-write",
      },
    },
    incidentState: "dual-leader-both-writable",
    values: {
      leaderCount: 2,
      writesPerRegionA: 40,
      writesPerRegionB: 38,
      divergentWriteCount: 46,
      conflictCount: 12,
      writeAuthorityState: "dual",
      regionAWriteAvailability: 100,
      regionBWriteAvailability: 100,
      partitionState: "partitioned",
      unreconciledWriteCount: 46,
      writeSafetyMechanism: "unresolved",
      coordinatorStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      leaderCount: 1,
      writesPerRegionA: 40,
      writesPerRegionB: 40,
      divergentWriteCount: 0,
      conflictCount: 0,
      writeAuthorityState: "single",
      regionAWriteAvailability: 100,
      regionBWriteAvailability: 100,
      partitionState: "healed",
      unreconciledWriteCount: 0,
      writeSafetyMechanism: "unresolved",
      coordinatorStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
