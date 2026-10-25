import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  LEDGER_AUTHORITATIVE_REGION_KEY,
  LEDGER_READ_MODE_KEY,
  LEDGER_WRITE_ROUTING_KEY,
  PROFILE_CONSISTENCY_MODE_KEY,
  REGION_A_ISOLATION_KEY,
  REGION_B_ISOLATION_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "region-a": "healthy",
  "replicated-service": "healthy",
  "region-b": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "region-a": "critical",
  "replicated-service": "critical",
  "region-b": "critical",
};

// Region A continues serving, Region B has been manually restricted
// (read-only/isolated).
const regionBRestrictedHealth: Record<string, ComponentHealth> = {
  "region-a": "healthy",
  "replicated-service": "healthy",
  "region-b": "degraded",
};

// Region B continues serving, Region A has been manually restricted.
const regionARestrictedHealth: Record<string, ComponentHealth> = {
  "region-a": "degraded",
  "replicated-service": "healthy",
  "region-b": "healthy",
};

// Both regions deliberately restricted.
const bothRestrictedHealth: Record<string, ComponentHealth> = {
  "region-a": "degraded",
  "replicated-service": "degraded",
  "region-b": "degraded",
};

/**
 * Authored rule table for Network Partition, ordered most-specific first.
 *
 * Business consistency requirement (stated in the candidate briefing, see
 * network-partition.ts): LEDGER writes (account balance / financial
 * transaction state) must never be accepted by more than one region at
 * the same time -- this is a hard correctness requirement, gated directly
 * on ledgerConsistencyViolationCount/ledgerWriteAuthority below, excluded
 * from the regionAAvailability/regionBAvailability fields no matter how
 * healthy those read. PROFILE writes (display name, UI preferences) MAY
 * legitimately tolerate temporary staleness or reduced availability
 * during the partition -- there is no correctness requirement for this
 * data, only a bounded availability/freshness tradeoff tracked via
 * profileStaleReadAgeSeconds/profileUnreconciledWriteCount, which
 * successCondition never gates on.
 *
 * LEDGER_WRITE_ROUTING_KEY is the structural lever: "single-region-
 * authoritative" means every ledger write is routed through exactly one
 * region (LEDGER_AUTHORITATIVE_REGION_KEY decides which) regardless of
 * which region a request physically lands in -- the only setting that is,
 * by itself, sufficient to keep ledgerConsistencyViolationCount at zero
 * through this (or any future) partition, with no manual judgment call
 * about which region to isolate. "local-region-authoritative" (the
 * dangerous default) means each region accepts ledger writes it receives
 * using only its own local view -- during a partition this lets BOTH
 * regions accept divergent ledger writes independently while
 * regionAAvailability and regionBAvailability both still read 100.
 *
 * LEDGER_AUTHORITATIVE_REGION_KEY only matters once single-region routing
 * is actually selected -- it decides WHICH region keeps full ledger
 * availability and which one takes the ledger-write-availability cost;
 * a real, authored, symmetric consequence (regionAAvailability/
 * regionBAvailability swap depending on this choice), never a
 * correctness difference.
 *
 * Manually isolating (read-only/isolated) the non-authoritative region
 * via REGION_A_ISOLATION_KEY/REGION_B_ISOLATION_KEY achieves the same
 * ledger safety RIGHT NOW without touching the routing control at all --
 * but it is not backed by the structural routing guarantee, so it is
 * scored (not completion-gated) as a lesser mechanism, mirroring Split-
 * Brain Incident's manual-isolation precedent.
 *
 * PROFILE_CONSISTENCY_MODE_KEY is an independent, legitimate business
 * tradeoff: "eventual-multi-region" keeps profile writes available in
 * both regions during the partition (a real, bounded, visible staleness
 * cost -- profileStaleReadAgeSeconds/profileUnreconciledWriteCount both
 * nonzero); "strong-single-region" routes profile writes through one
 * region only, eliminating that staleness (both fields drop to zero) but
 * trading away profile-write availability in the other region for a
 * correctness guarantee the business never required for this data.
 * Neither value is gated by successCondition -- this is a genuine,
 * defensible choice either way.
 */
export const networkPartitionRules: Rule[] = [
  // ── Post-heal reconciliation (networkHealed=true). Checked first
  // since it implies networkPartitioned was also set earlier, so these
  // must win over the partition-era rules below once healing has
  // actually occurred. A real ledger violation count from an UNSAFE
  // dual-write window during the partition does not retroactively
  // vanish; profile backlog clears once replication resumes regardless
  // of ledger routing.
  {
    id: "healed-ledger-violations-persist",
    when: {
      triggerEquals: { networkHealed: true },
      controlEquals: { [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative" },
    },
    incidentState: "healed-ledger-violations-persist",
    values: {
      replicationHealth: "replicating",
      regionAAvailability: 100,
      regionBAvailability: 100,
      profileStaleReadAgeSeconds: 0,
      profileUnreconciledWriteCount: 0,
      ledgerConsistencyViolationCount: 18,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "critical",
      ledgerSafetyMechanism: "unresolved",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "healed-safe",
    when: {
      triggerEquals: { networkHealed: true },
    },
    incidentState: "healed-safe",
    values: {
      replicationHealth: "replicating",
      regionAAvailability: 100,
      regionBAvailability: 100,
      profileStaleReadAgeSeconds: 0,
      profileUnreconciledWriteCount: 0,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "normal",
      ledgerSafetyMechanism: "unresolved",
    },
    componentHealth: healthyHealth,
  },

  // ── Partition-era states (networkPartitioned=true, networkHealed not
  // yet set). Ordered most-specific first.

  // ── OPTIMAL + strong-single-region profile mode layered on top: the
  // candidate additionally decided profile writes should NOT tolerate
  // staleness either, routing them through one region too. This
  // eliminates profileStaleReadAgeSeconds/profileUnreconciledWriteCount
  // entirely (both read 0) -- genuinely defensible -- but it is a strictly
  // stricter choice than the business actually required for profile
  // data, and profile write availability in the non-authoritative region
  // (captured by the Region B health/component state, not a dedicated
  // numeric field) is reduced as a result. Checked before the
  // eventual-multi-region variant below so this more-specific control
  // combination wins.
  {
    id: "single-region-routed-a-strong-profile",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "single-region-authoritative",
        [LEDGER_AUTHORITATIVE_REGION_KEY]: "region-a",
        [LEDGER_READ_MODE_KEY]: "allow-stale-reads",
        [PROFILE_CONSISTENCY_MODE_KEY]: "strong-single-region",
      },
    },
    incidentState: "single-region-routed-a-strong-profile",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 100,
      regionBAvailability: 90,
      profileStaleReadAgeSeconds: 0,
      profileUnreconciledWriteCount: 0,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 30,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "single-region-routed",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: single-region-authoritative ledger routing, Region A
  // chosen as authoritative, stale ledger reads allowed in Region B,
  // profile left at the eventual-multi-region default. The structural
  // fix: ledger writes always resolve to Region A, so this stays safe
  // through this partition and any future one. Region B's ledger reads
  // may be stale (staleLedgerReadsServedPerMin > 0) -- a visible,
  // separate cost from correctness. Profile writes remain fully
  // available in both regions, at the cost of real, bounded staleness
  // (profileStaleReadAgeSeconds/profileUnreconciledWriteCount nonzero) --
  // a deliberate, defensible tradeoff the business explicitly allows for
  // this data category.
  {
    id: "single-region-routed-a-stale-reads-allowed",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "single-region-authoritative",
        [LEDGER_AUTHORITATIVE_REGION_KEY]: "region-a",
        [LEDGER_READ_MODE_KEY]: "allow-stale-reads",
        [PROFILE_CONSISTENCY_MODE_KEY]: "eventual-multi-region",
      },
    },
    incidentState: "single-region-routed-a",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 100,
      regionBAvailability: 100,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 30,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "single-region-routed",
    },
    componentHealth: healthyHealth,
  },
  // ── OPTIMAL, stricter on ledger reads: same structural routing fix to
  // Region A, but stale ledger reads in Region B are blocked outright --
  // zero stale-ledger-read risk, at the cost of ledger read availability
  // in Region B specifically (regionBAvailability drops, since that
  // region can no longer serve ledger reads it would otherwise have to
  // mark stale).
  {
    id: "single-region-routed-a-stale-reads-blocked",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "single-region-authoritative",
        [LEDGER_AUTHORITATIVE_REGION_KEY]: "region-a",
        [LEDGER_READ_MODE_KEY]: "block-stale-reads",
      },
    },
    incidentState: "single-region-routed-a-strict",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 100,
      regionBAvailability: 85,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "normal",
      ledgerSafetyMechanism: "single-region-routed",
    },
    componentHealth: healthyHealth,
  },
  // ── Mirror: Region B chosen as authoritative instead. Equally safe
  // and equally structural -- which region stays fully available is a
  // business/latency decision, not a correctness one.
  {
    id: "single-region-routed-b-stale-reads-allowed",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "single-region-authoritative",
        [LEDGER_AUTHORITATIVE_REGION_KEY]: "region-b",
        [LEDGER_READ_MODE_KEY]: "allow-stale-reads",
      },
    },
    incidentState: "single-region-routed-b",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 100,
      regionBAvailability: 100,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 30,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "single-region-routed",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "single-region-routed-b-stale-reads-blocked",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "single-region-authoritative",
        [LEDGER_AUTHORITATIVE_REGION_KEY]: "region-b",
        [LEDGER_READ_MODE_KEY]: "block-stale-reads",
      },
    },
    incidentState: "single-region-routed-b-strict",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 85,
      regionBAvailability: 100,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "normal",
      ledgerSafetyMechanism: "single-region-routed",
    },
    componentHealth: healthyHealth,
  },

  // ── Both regions deliberately isolated from the write path entirely
  // (every read-only/isolated combination on both sides). Fully safe --
  // zero ledger writes anywhere means zero divergence -- but needlessly
  // conservative: all ledger write availability was sacrificed when at
  // least one side could have safely stayed up. Checked BEFORE the
  // single-region-isolated rules below, since those only constrain ONE
  // region's isolation control and would otherwise match first whenever
  // both regions happen to be isolated (more-specific-first ordering).
  {
    id: "both-regions-isolated-ro-ro",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative",
        [REGION_A_ISOLATION_KEY]: "read-only",
        [REGION_B_ISOLATION_KEY]: "read-only",
      },
    },
    incidentState: "both-regions-isolated",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 0,
      regionBAvailability: 0,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "both-isolated",
    },
    componentHealth: bothRestrictedHealth,
  },
  {
    id: "both-regions-isolated-ro-isolated",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative",
        [REGION_A_ISOLATION_KEY]: "read-only",
        [REGION_B_ISOLATION_KEY]: "isolated",
      },
    },
    incidentState: "both-regions-isolated",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 0,
      regionBAvailability: 0,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "both-isolated",
    },
    componentHealth: bothRestrictedHealth,
  },
  {
    id: "both-regions-isolated-isolated-ro",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative",
        [REGION_A_ISOLATION_KEY]: "isolated",
        [REGION_B_ISOLATION_KEY]: "read-only",
      },
    },
    incidentState: "both-regions-isolated",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 0,
      regionBAvailability: 0,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "both-isolated",
    },
    componentHealth: bothRestrictedHealth,
  },
  {
    id: "both-regions-isolated-isolated-isolated",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative",
        [REGION_A_ISOLATION_KEY]: "isolated",
        [REGION_B_ISOLATION_KEY]: "isolated",
      },
    },
    incidentState: "both-regions-isolated",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 0,
      regionBAvailability: 0,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "both-isolated",
    },
    componentHealth: bothRestrictedHealth,
  },

  // ── UNSAFE-by-choice-but-not-corrupt: manual isolation of Region B
  // while ledger routing is still left at the default
  // local-region-authoritative. Isolating B removes it from the write
  // path entirely, so A becomes the only region left able to accept
  // ledger writes -- genuinely safe right now (zero violations), but
  // this is NOT the structural routing fix: if B were ever reinstated to
  // "serving" without the routing control also being fixed, the same
  // dual-write trap could recur. Checked before the dual-write trap rule
  // below (these require B to be read-only/isolated; the trap requires
  // both regions "serving"). The both-regions-isolated rules above are
  // checked first since they are strictly more specific (constrain BOTH
  // regions' isolation controls, not just one).
  {
    id: "region-b-isolated-manual-safe",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative",
        [REGION_B_ISOLATION_KEY]: "read-only",
      },
    },
    incidentState: "region-b-isolated-manual",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 100,
      regionBAvailability: 0,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "region-isolated",
    },
    componentHealth: regionBRestrictedHealth,
  },
  {
    id: "region-b-fully-isolated-manual-safe",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative",
        [REGION_B_ISOLATION_KEY]: "isolated",
      },
    },
    incidentState: "region-b-isolated-manual",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 100,
      regionBAvailability: 0,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "region-isolated",
    },
    componentHealth: regionBRestrictedHealth,
  },
  // Mirror: Region A manually isolated instead, leaving Region B as the
  // sole writer. Equally safe right now -- which side stays up is a
  // business/latency decision, not a correctness one, as long as exactly
  // one side keeps accepting ledger writes.
  {
    id: "region-a-isolated-manual-safe",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative",
        [REGION_A_ISOLATION_KEY]: "read-only",
      },
    },
    incidentState: "region-a-isolated-manual",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 0,
      regionBAvailability: 100,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "region-isolated",
    },
    componentHealth: regionARestrictedHealth,
  },
  {
    id: "region-a-fully-isolated-manual-safe",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative",
        [REGION_A_ISOLATION_KEY]: "isolated",
      },
    },
    incidentState: "region-a-isolated-manual",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 0,
      regionBAvailability: 100,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "warning",
      ledgerSafetyMechanism: "region-isolated",
    },
    componentHealth: regionARestrictedHealth,
  },

  // ── THE TRAP: ledger routing left at local-region-authoritative
  // (default) with BOTH regions left at "serving" (default) -- no
  // routing fix, no manual isolation. Each side's own local view says
  // nothing has changed about its right to accept ledger writes, so both
  // regions independently accept them. regionAAvailability and
  // regionBAvailability both read 100 -- customer-facing availability
  // looks fully healthy in BOTH regions at once. ledgerWriteAuthority=
  // "dual" and ledgerConsistencyViolationCount climbing are the directly
  // observable, real correctness damage. This state must never satisfy
  // successCondition or any acceptableCondition, no matter how healthy
  // availability reads.
  {
    id: "dual-ledger-write-trap",
    when: {
      triggerEquals: { networkPartitioned: true },
      controlEquals: {
        [LEDGER_WRITE_ROUTING_KEY]: "local-region-authoritative",
        [REGION_A_ISOLATION_KEY]: "serving",
        [REGION_B_ISOLATION_KEY]: "serving",
      },
    },
    incidentState: "dual-ledger-write-trap",
    values: {
      replicationHealth: "broken",
      regionAAvailability: 100,
      regionBAvailability: 100,
      profileStaleReadAgeSeconds: 90,
      profileUnreconciledWriteCount: 24,
      ledgerConsistencyViolationCount: 22,
      ledgerWriteAuthority: "dual",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "critical",
      ledgerSafetyMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      replicationHealth: "replicating",
      regionAAvailability: 100,
      regionBAvailability: 100,
      profileStaleReadAgeSeconds: 0,
      profileUnreconciledWriteCount: 0,
      ledgerConsistencyViolationCount: 0,
      ledgerWriteAuthority: "single",
      staleLedgerReadsServedPerMin: 0,
      ledgerSafetyStatus: "normal",
      ledgerSafetyMechanism: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
