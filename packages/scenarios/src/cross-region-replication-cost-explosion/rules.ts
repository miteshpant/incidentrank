import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ARCHIVE_REPLICATION_MODE_KEY,
  CRITICAL_DATA_PINNING_KEY,
  CRITICAL_REPLICATION_FACTOR_KEY,
  LOW_PRIORITY_REGION_FAN_OUT_KEY,
  LOW_PRIORITY_REPLICATION_FACTOR_KEY,
  STANDARD_REPLICATION_MODE_KEY,
  TRANSFER_BATCHING_KEY,
  TRANSFER_COMPRESSION_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "us-region": "healthy",
  "eu-region": "healthy",
  "apac-region": "healthy",
  "replication-layer": "healthy",
  "primary-data-store": "healthy",
  "archive-object-storage": "healthy",
};

// Nothing in this scenario is ever an outage — "degraded"/"critical"
// component health is never used to represent availability failure.
// The only non-healthy marker used anywhere below is on
// primary-data-store, and only to make an ACTIVE durability breach
// visually legible to the candidate as "this is not fine," never to
// imply traffic is failing.
const durabilityAtRiskHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "primary-data-store": "degraded",
};

const durabilityBreachedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "primary-data-store": "critical",
};

/**
 * Authored rule table for Cross-Region Replication Cost Explosion,
 * ordered most-specific-first. There is no outage anywhere in this
 * table — every rule's componentHealth stays "healthy" except the two
 * durability-breach states, and even those never touch availability-
 * facing fields (there are none in this scenario's metrics; see
 * metrics.ts). The whole table is a cost/durability/freshness POLICY
 * judgment overlaid on an already-functioning system.
 *
 * Two genuinely distinct safe strategies exist, independently and
 * combinably:
 *
 *   Strategy A — SCOPE reduction: narrow low-priority data's region
 *   fan-out (LOW_PRIORITY_REGION_FAN_OUT_KEY: origin-plus-one) and drop
 *   its replication factor (LOW_PRIORITY_REPLICATION_FACTOR_KEY). This
 *   touches WHICH regions receive a copy and how many copies exist for
 *   a class that was never policy-mandated to need full regional
 *   coverage. It does nothing to the standard class's replication mode.
 *
 *   Strategy B — MODE reduction: switch the standard class from
 *   synchronous to async-batched replication
 *   (STANDARD_REPLICATION_MODE_KEY). This touches HOW URGENTLY a copy
 *   is shipped for a class that does not need synchronous freshness,
 *   while leaving fan-out scope and replication factor untouched for
 *   every class. Combined with compression and large batching, this
 *   reaches real cost relief through an entirely different mechanism
 *   than Strategy A — no fan-out narrowing at all.
 *
 * Both strategies leave criticalReplicationFactor at 3 (full policy
 * floor, or reduced-but-pinned/corrected) and leave
 * criticalDataDurabilityStatus at "policy-compliant" — neither
 * strategy touches the actual durability-floor question at all, which
 * is exactly the point: the durability floor and the cost-reduction
 * levers are orthogonal decisions, and a candidate can get real,
 * substantial cost relief without ever touching the floor.
 *
 * The UNSAFE MINIMUM-COST TRAP is dropping criticalReplicationFactor
 * itself below 3. This looks like the single biggest cost win in the
 * entire rule table (it touches the class with the largest per-copy
 * storage/transfer footprint) and changes nothing about freshness
 * (criticalFreshnessSeconds stays excellent — the data is still
 * replicated, just to fewer copies) — but it is a genuine, named
 * policy-floor violation (criticalDataDurabilityStatus:
 * "below-policy-floor"), and if a disaster-recovery verification
 * drill runs while the floor is breached, a REAL, non-resetting
 * historical exposure consequence is recorded
 * (criticalDataExposureEventCount, peak-tracked) that survives even if
 * the factor is restored to 3 immediately afterward.
 */
export const crossRegionReplicationCostExplosionRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE MINIMUM-COST TRAP — critical replication factor dropped
  // below the policy floor. Checked FIRST (highest priority): this is
  // never acceptable regardless of how good every other lever looks,
  // and must never be shadowed by a more aggressively-optimized but
  // still-compliant combination below.
  // ══════════════════════════════════════════════════════════════════

  // ── Breach held through a SECOND drill: proves exposure accrues
  // again at the SECOND drill if the floor is still breached at that
  // point, not merely once ever — a real, cumulative, time-sensitive
  // historical record, never a flat one-time flag. Checked BEFORE the
  // single-drill rule below since drDrill2Active implies drDrillActive
  // is also true from this point on (see timed-events.ts) — this more
  // specific rule must win or it would be permanently shadowed.
  {
    id: "critical-factor-breached-drilled-twice",
    when: {
      triggerEquals: { policyChangeDiscovered: true, drDrill2Active: true },
      controlAtMost: { [CRITICAL_REPLICATION_FACTOR_KEY]: 2 },
    },
    incidentState: "critical-factor-breached-drilled-twice",
    values: {
      monthlyCrossRegionTransferCostUsd: 1_100,
      monthlyStorageDuplicationCostUsd: 500,
      monthlyTotalReplicationCostUsd: 1_600,
      costReductionTier: "deep-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 2,
      lowPriorityFreshnessSeconds: 3,
      criticalDataDurabilityStatus: "below-policy-floor",
      replicationScopeStatus: "full-uniform-fanout",
      archiveDurabilityStatus: "full-sync-unneeded",
      criticalDataExposureEventCount: 2,
      drDrillStatus: "breach-detected",
    },
    componentHealth: durabilityBreachedHealth,
  },

  // ── Breach caught live by a DR verification drill: the single worst
  // reachable state. Cost looks spectacular (lowest in the whole
  // table), freshness still reads perfectly fine, but a drill just
  // proved the durability floor was not being honored — a real,
  // permanent exposure event is recorded this tick.
  {
    id: "critical-factor-breached-drilled",
    when: {
      triggerEquals: { policyChangeDiscovered: true, drDrillActive: true },
      controlAtMost: { [CRITICAL_REPLICATION_FACTOR_KEY]: 2 },
    },
    incidentState: "critical-factor-breached-drilled",
    values: {
      monthlyCrossRegionTransferCostUsd: 1_100,
      monthlyStorageDuplicationCostUsd: 500,
      monthlyTotalReplicationCostUsd: 1_600,
      costReductionTier: "deep-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 2,
      lowPriorityFreshnessSeconds: 3,
      criticalDataDurabilityStatus: "below-policy-floor",
      replicationScopeStatus: "full-uniform-fanout",
      archiveDurabilityStatus: "full-sync-unneeded",
      criticalDataExposureEventCount: 1,
      drDrillStatus: "breach-detected",
    },
    componentHealth: durabilityBreachedHealth,
  },

  // ── Breached but no drill has run yet: the floor is genuinely
  // violated right now (criticalDataDurabilityStatus correctly reads
  // "below-policy-floor"), but no drill has caught it yet, so no
  // exposure event has been recorded yet either — proving the
  // exposure counter is about a real, drill-verified historical
  // event, never merely "the control was ever set this way."
  {
    id: "critical-factor-breached-undetected",
    when: {
      triggerEquals: { policyChangeDiscovered: true },
      controlAtMost: { [CRITICAL_REPLICATION_FACTOR_KEY]: 2 },
    },
    incidentState: "critical-factor-breached-undetected",
    values: {
      monthlyCrossRegionTransferCostUsd: 1_100,
      monthlyStorageDuplicationCostUsd: 500,
      monthlyTotalReplicationCostUsd: 1_600,
      costReductionTier: "deep-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 2,
      lowPriorityFreshnessSeconds: 3,
      criticalDataDurabilityStatus: "below-policy-floor",
      replicationScopeStatus: "full-uniform-fanout",
      archiveDurabilityStatus: "full-sync-unneeded",
      criticalDataExposureEventCount: 0,
      drDrillStatus: "none-scheduled",
    },
    componentHealth: durabilityAtRiskHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE COMBINED TIER — both Strategy A (scope) and Strategy B (mode)
  // engaged together, plus the orthogonal always-safe levers
  // (compression, archive batch mode, transfer batching), critical
  // factor untouched. This is the cost-floor ceiling reachable WITHOUT
  // ever breaching durability — listed before either strategy alone so
  // the fully-optimized, still-compliant combination is recognized
  // first.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "both-strategies-fully-optimized",
    when: {
      triggerEquals: { policyChangeDiscovered: true },
      controlEquals: {
        [CRITICAL_REPLICATION_FACTOR_KEY]: 3,
        [LOW_PRIORITY_REGION_FAN_OUT_KEY]: "origin-plus-one",
        [STANDARD_REPLICATION_MODE_KEY]: "async-batched",
        [TRANSFER_COMPRESSION_KEY]: "on",
        [ARCHIVE_REPLICATION_MODE_KEY]: "scheduled-batch",
        [TRANSFER_BATCHING_KEY]: "large-batched",
      },
      controlAtMost: { [LOW_PRIORITY_REPLICATION_FACTOR_KEY]: 2 },
    },
    incidentState: "both-strategies-fully-optimized",
    values: {
      monthlyCrossRegionTransferCostUsd: 1_350,
      monthlyStorageDuplicationCostUsd: 780,
      monthlyTotalReplicationCostUsd: 2_130,
      costReductionTier: "deep-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 45,
      lowPriorityFreshnessSeconds: 90,
      criticalDataDurabilityStatus: "policy-compliant",
      replicationScopeStatus: "scope-and-mode-optimized",
      archiveDurabilityStatus: "scheduled-batch-compliant",
      criticalDataExposureEventCount: 0,
      drDrillStatus: "none-scheduled",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // STRATEGY A ALONE — scope reduction for low-priority data. Standard
  // class stays fully synchronous (STANDARD_REPLICATION_MODE_KEY left
  // at "sync") and low-priority fan-out is narrowed. Real cost relief
  // through a SCOPE mechanism, zero durability risk (low-priority was
  // never policy-mandated to need full coverage).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "strategy-a-scope-reduction",
    when: {
      triggerEquals: { policyChangeDiscovered: true },
      controlEquals: {
        [CRITICAL_REPLICATION_FACTOR_KEY]: 3,
        [LOW_PRIORITY_REGION_FAN_OUT_KEY]: "origin-plus-one",
        [STANDARD_REPLICATION_MODE_KEY]: "sync",
      },
      controlAtMost: { [LOW_PRIORITY_REPLICATION_FACTOR_KEY]: 2 },
    },
    incidentState: "strategy-a-scope-reduction",
    values: {
      monthlyCrossRegionTransferCostUsd: 2_600,
      monthlyStorageDuplicationCostUsd: 900,
      monthlyTotalReplicationCostUsd: 3_500,
      costReductionTier: "good-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 2,
      lowPriorityFreshnessSeconds: 95,
      criticalDataDurabilityStatus: "policy-compliant",
      replicationScopeStatus: "scope-narrowed",
      archiveDurabilityStatus: "full-sync-unneeded",
      criticalDataExposureEventCount: 0,
      drDrillStatus: "none-scheduled",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // STRATEGY B ALONE — mode reduction for the standard class. Fan-out
  // scope stays full ("all-regions") for low-priority data and
  // low-priority's own replication factor stays at the inherited
  // value of 3 — nothing about WHICH regions get copies changes at
  // all. Real cost relief through a different, MODE-based mechanism.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "strategy-b-async-batched",
    when: {
      triggerEquals: { policyChangeDiscovered: true },
      controlEquals: {
        [CRITICAL_REPLICATION_FACTOR_KEY]: 3,
        [LOW_PRIORITY_REGION_FAN_OUT_KEY]: "all-regions",
        [LOW_PRIORITY_REPLICATION_FACTOR_KEY]: 3,
        [STANDARD_REPLICATION_MODE_KEY]: "async-batched",
      },
    },
    incidentState: "strategy-b-async-batched",
    values: {
      monthlyCrossRegionTransferCostUsd: 2_750,
      monthlyStorageDuplicationCostUsd: 2_100,
      monthlyTotalReplicationCostUsd: 4_850,
      costReductionTier: "moderate-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 40,
      lowPriorityFreshnessSeconds: 3,
      criticalDataDurabilityStatus: "policy-compliant",
      replicationScopeStatus: "mode-shifted",
      archiveDurabilityStatus: "full-sync-unneeded",
      criticalDataExposureEventCount: 0,
      drDrillStatus: "none-scheduled",
    },
    componentHealth: healthyHealth,
  },

  // ── Archive-only fix: archive replication moved off full-sync, no
  // other lever touched. Real, always-safe relief isolated to the
  // archive path, proving ARCHIVE_REPLICATION_MODE_KEY is a genuine,
  // independent cost lever rather than only mattering when combined
  // with the primary-store strategies above.
  {
    id: "archive-only-fix",
    when: {
      triggerEquals: { policyChangeDiscovered: true },
      controlEquals: {
        [CRITICAL_REPLICATION_FACTOR_KEY]: 3,
        [LOW_PRIORITY_REGION_FAN_OUT_KEY]: "all-regions",
        [STANDARD_REPLICATION_MODE_KEY]: "sync",
        [ARCHIVE_REPLICATION_MODE_KEY]: "scheduled-batch",
      },
    },
    incidentState: "archive-only-fix",
    values: {
      monthlyCrossRegionTransferCostUsd: 4_200,
      monthlyStorageDuplicationCostUsd: 1_050,
      monthlyTotalReplicationCostUsd: 5_250,
      costReductionTier: "minimal-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 2,
      lowPriorityFreshnessSeconds: 3,
      criticalDataDurabilityStatus: "policy-compliant",
      replicationScopeStatus: "full-uniform-fanout",
      archiveDurabilityStatus: "scheduled-batch-compliant",
      criticalDataExposureEventCount: 0,
      drDrillStatus: "none-scheduled",
    },
    componentHealth: healthyHealth,
  },

  // ── Compression-only fix: always-safe, uniformly-applied byte
  // reduction with no scope/mode change for any class. Real but
  // modest relief, proving TRANSFER_COMPRESSION_KEY is not a dead
  // control even with nothing else touched.
  {
    id: "compression-only-fix",
    when: {
      triggerEquals: { policyChangeDiscovered: true },
      controlEquals: {
        [CRITICAL_REPLICATION_FACTOR_KEY]: 3,
        [LOW_PRIORITY_REGION_FAN_OUT_KEY]: "all-regions",
        [STANDARD_REPLICATION_MODE_KEY]: "sync",
        [TRANSFER_COMPRESSION_KEY]: "on",
      },
    },
    incidentState: "compression-only-fix",
    values: {
      monthlyCrossRegionTransferCostUsd: 3_150,
      monthlyStorageDuplicationCostUsd: 2_100,
      monthlyTotalReplicationCostUsd: 5_250,
      costReductionTier: "minimal-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 2,
      lowPriorityFreshnessSeconds: 3,
      criticalDataDurabilityStatus: "policy-compliant",
      replicationScopeStatus: "full-uniform-fanout",
      archiveDurabilityStatus: "full-sync-unneeded",
      criticalDataExposureEventCount: 0,
      drDrillStatus: "none-scheduled",
    },
    componentHealth: healthyHealth,
  },

  // ── Pinning engaged, no cost lever touched yet: a deliberate,
  // visible acknowledgment that the critical floor is being protected
  // on purpose. Costs exactly what the baseline costs (pinning is a
  // safety rail, never a cost lever by itself) — proving
  // CRITICAL_DATA_PINNING_KEY has a real, distinct authored
  // consequence (this exact state) rather than silently aliasing the
  // plain baseline.
  {
    id: "pinned-no-other-action",
    when: {
      triggerEquals: { policyChangeDiscovered: true },
      controlEquals: {
        [CRITICAL_REPLICATION_FACTOR_KEY]: 3,
        [CRITICAL_DATA_PINNING_KEY]: true,
      },
    },
    incidentState: "pinned-no-other-action",
    values: {
      monthlyCrossRegionTransferCostUsd: 4_200,
      monthlyStorageDuplicationCostUsd: 2_100,
      monthlyTotalReplicationCostUsd: 6_300,
      costReductionTier: "no-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 2,
      lowPriorityFreshnessSeconds: 3,
      criticalDataDurabilityStatus: "policy-compliant",
      replicationScopeStatus: "full-uniform-fanout",
      archiveDurabilityStatus: "full-sync-unneeded",
      criticalDataExposureEventCount: 0,
      drDrillStatus: "none-scheduled",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — policy change discovered, nothing touched. This is the
  // state a zero-action candidate sits in indefinitely: durability is
  // fine, but cost is at its unmitigated peak and shows no sign of
  // improving on its own.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-cost-explosion",
    when: { triggerEquals: { policyChangeDiscovered: true } },
    incidentState: "baseline-cost-explosion",
    values: {
      monthlyCrossRegionTransferCostUsd: 4_200,
      monthlyStorageDuplicationCostUsd: 2_100,
      monthlyTotalReplicationCostUsd: 6_300,
      costReductionTier: "no-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 2,
      lowPriorityFreshnessSeconds: 3,
      criticalDataDurabilityStatus: "policy-compliant",
      replicationScopeStatus: "full-uniform-fanout",
      archiveDurabilityStatus: "full-sync-unneeded",
      criticalDataExposureEventCount: 0,
      drDrillStatus: "none-scheduled",
    },
    componentHealth: healthyHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      monthlyCrossRegionTransferCostUsd: 4_200,
      monthlyStorageDuplicationCostUsd: 2_100,
      monthlyTotalReplicationCostUsd: 6_300,
      costReductionTier: "no-reduction",
      criticalFreshnessSeconds: 1,
      standardFreshnessSeconds: 2,
      lowPriorityFreshnessSeconds: 3,
      criticalDataDurabilityStatus: "policy-compliant",
      replicationScopeStatus: "full-uniform-fanout",
      archiveDurabilityStatus: "full-sync-unneeded",
      criticalDataExposureEventCount: 0,
      drDrillStatus: "none-scheduled",
    },
    componentHealth: healthyHealth,
  },
];
