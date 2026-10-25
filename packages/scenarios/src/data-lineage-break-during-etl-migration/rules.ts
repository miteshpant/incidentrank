import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CUTOVER_AUDIT_LOG_KEY,
  CUTOVER_STRATEGY_KEY,
  LEGACY_PATH_DECOMMISSION_KEY,
  LINEAGE_FLAGGING_KEY,
  RECONCILIATION_DEPTH_KEY,
  REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  sources: "healthy",
  "etl-v1": "healthy",
  "etl-v2": "healthy",
  warehouse: "healthy",
  "metrics-layer": "healthy",
  reports: "healthy",
};

// Sources/Warehouse/Reports NEVER leave "healthy" in this scenario, in
// any rule, including every unsafe one — the entire Principal-level
// point is that availability never signals the problem. Only ETL v1/v2
// and the Metrics Layer communicate severity, since lineage trust is
// what is actually at risk.
const migratingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "etl-v2": "degraded",
  "metrics-layer": "degraded",
};

const migratingCriticalHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "etl-v2": "critical",
  "metrics-layer": "critical",
};

const silentUnsafeHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "etl-v1": "critical",
  "etl-v2": "critical",
  "metrics-layer": "critical",
};

const cuttingOverHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "etl-v1": "degraded",
  "etl-v2": "degraded",
  "metrics-layer": "degraded",
};

/**
 * Authored rule table for Data Lineage Break During ETL Migration,
 * ordered most-specific-first (first-match-wins, top-to-bottom). The
 * two independent unsafe correctness traps are checked first, then the
 * two required alternate strong paths (staged-per-source;
 * dual-write-reconcile), then the undecided/no-mitigation baseline
 * family.
 *
 * ROOT CAUSE: an ETL v1 -> v2 migration begins (migrationInProgress).
 * sourcesAvailabilityPercent, warehouseWriteSuccessRate, and
 * reportGenerationSuccessRate never move in ANY rule below — this must
 * never look like a generic availability/outage incident. The visible
 * symptoms are entirely in migration-progress and lineage-trust fields:
 * sourcesCutOverCount, sourcesInInconsistentStateCount,
 * metricsWithMixedLineagePercent, lineageConsistencyStatus.
 *
 * CENTRAL JUDGMENT (business invariants #1/#2/#3/#4, phase6e3.md): a
 * report/metric must never silently mix v1-derived and v2-derived data
 * within the same computed value, and cutover must be traceable/
 * auditable per source/metric rather than an opaque global flip.
 * cutoverStrategy="global-flip" is this scenario's primary required
 * trap: a single switch routes every source to v2 at once the instant
 * v2 looks like it passed a shallow smoke test, giving every downstream
 * metric/report zero staged checkpoint — if v1/v2 diverge for even one
 * source, every metric blending multiple sources is now silently mixed
 * with no rollback point narrower than "revert everything."
 * lineageFlagging="on" at least visibly FLAGS this
 * (lineageConsistencyStatus reads "inconsistent-flagged" rather than a
 * false "consistent" reading) — flagging alone does not stop the
 * exposure, but it is a required precondition for any real remediation.
 * Left unflagged, the exposure is silent AND accrues
 * reportsServedWhileInconsistentCount — the scenario's required
 * minimum-cost-looks-great-but-unsafe trap: zero extra infrastructure,
 * zero staged delay, sourcesAvailabilityPercent/warehouseWriteSuccessRate/
 * reportGenerationSuccessRate identical to every safe path, yet the
 * single worst dataIntegrity/reliability outcome in the entire scenario.
 *
 * SECOND, INDEPENDENT UNSAFE TRAP: legacyPathDecommission=
 * "decommission-v1" while any source has not yet reached a verified,
 * fully-consistent v2 lineage. Tearing down v1 early looks like a clean,
 * decisive way to stop paying for two pipelines — but it permanently
 * removes the only reference path that could have caught or rolled back
 * a divergence for whichever sources were not yet verified. Reachable
 * even on top of an otherwise-staged migration, proving the trap is not
 * only reachable through cutoverStrategy="global-flip".
 *
 * REQUIRED ALTERNATE STRONG PATHS (phase6e3.md):
 *   A. cutoverStrategy="staged-per-source" — cuts over one source at a
 *      time, in controlled, auditable stages. Each source's lineage is
 *      always exactly one of v1 or v2, never a blend, at every stage —
 *      this protects lineage consistency IMMEDIATELY (no drain lag for
 *      the sources already cut over), at the real cost of a slower
 *      overall migration (sourcesCutOverCount climbs gradually across
 *      real elapsed cutover windows rather than all at once).
 *   B. cutoverStrategy="dual-write-reconcile" — runs v1 and v2 in
 *      parallel for every source, reconciles their outputs, and only
 *      declares a source cut over once v2 is PROVEN to match v1 within
 *      tolerance (reconciliationDepth="full" for the strongest version;
 *      "shallow" still genuinely safe — never blended — but a real,
 *      honest lower-assurance variant since it can miss a value-level
 *      divergence a full check would catch). Real, ongoing dual-compute
 *      cost for as long as both paths run.
 *
 * NO SCALE-X-OVERLOAD-Y MECHANIC: nothing in this scenario scales a
 * service and then overloads a downstream dependency. Every lever here
 * either changes the cutover sequencing/granularity (A), changes how
 * much cross-verification happens before declaring cutover complete
 * (B), changes visibility (lineageFlagging/cutoverAuditLog/
 * reportGateOnInconsistentLineage), or tears down (or keeps) redundant
 * infrastructure (legacyPathDecommission) — none of them create a NEW
 * bottleneck elsewhere.
 *
 * cutoverAuditLog ("record per-source cutover steps", business invariant
 * #2) is a real, modest, secondary lever WITHIN the two alternate-strong-
 * path families only: every staged-per-source/dual-write-reconcile
 * in-progress row below (just-engaged/window1/window2) is split into a
 * cutoverAuditLog=true variant (cutoverAuditability: "traceable") and the
 * cutoverAuditLog=false/default variant (cutoverAuditability: "opaque").
 * It does not apply to global-flip or the undecided baseline: a global
 * flip has no per-source staged steps to log at all (cutoverAuditability
 * stays "opaque" unconditionally there, consistent with global-flip
 * never providing a staged, auditable checkpoint by construction), and
 * nothing has been cut over yet while undecided. scoring.ts's
 * dataIntegrity dimension carries a small additional penalty keyed on
 * cutoverAuditability === "opaque" while migrationStatus is
 * "in-progress-safe" — modest and secondary, never large enough to
 * change which of cutoverStrategy/reconciliationDepth is optimal.
 */
export const dataLineageBreakDuringEtlMigrationRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAPS — checked first: win regardless of every
  // other control, because a lineage-mixing violation is never
  // acceptable however healthy availability looks.
  // ══════════════════════════════════════════════════════════════════

  // Global-flip, silent (unflagged): the scenario's primary required
  // trap. Zero extra infra, zero staged delay, availability identical
  // to every safe path — yet every metric that blends multiple sources
  // is silently mixed v1/v2-derived with no flag anywhere.
  {
    id: "global-flip-silent-sustained",
    when: {
      triggerEquals: { migrationInProgress: true, sustainedUndecided: true },
      controlEquals: {
        [CUTOVER_STRATEGY_KEY]: "global-flip",
        [LINEAGE_FLAGGING_KEY]: false,
      },
    },
    incidentState: "global-flip-silent-sustained",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 12,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 7,
      metricsWithMixedLineagePercent: 58,
      lineageConsistencyStatus: "inconsistent-silent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 410,
      migrationStatus: "in-progress-unsafe",
      lineageTrustSeverity: "critical",
    },
    componentHealth: silentUnsafeHealth,
  },
  {
    id: "global-flip-silent-active",
    when: {
      triggerEquals: { migrationInProgress: true },
      controlEquals: {
        [CUTOVER_STRATEGY_KEY]: "global-flip",
        [LINEAGE_FLAGGING_KEY]: false,
      },
    },
    incidentState: "global-flip-silent-active",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 12,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 5,
      metricsWithMixedLineagePercent: 40,
      lineageConsistencyStatus: "inconsistent-silent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 90,
      migrationStatus: "in-progress-unsafe",
      lineageTrustSeverity: "critical",
    },
    componentHealth: silentUnsafeHealth,
  },

  // Global-flip, flagged but ungated: lineageFlagging alone is a
  // required precondition for visibility, but it does not by itself
  // stop reports from being served while inconsistent — without
  // reportGateOnInconsistentLineage also engaged, the flagged-but-
  // still-served reports keep accruing the same historical exposure
  // counter, just with honest visibility instead of silence. Listed
  // before the generic global-flip-unflagged-active catch-all is not
  // needed since this constrains lineageFlagging=true specifically.
  {
    id: "global-flip-flagged-ungated",
    when: {
      triggerEquals: { migrationInProgress: true },
      controlEquals: {
        [CUTOVER_STRATEGY_KEY]: "global-flip",
        [LINEAGE_FLAGGING_KEY]: true,
        [REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY]: false,
      },
    },
    incidentState: "global-flip-flagged-ungated",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 12,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 5,
      metricsWithMixedLineagePercent: 40,
      lineageConsistencyStatus: "inconsistent-flagged",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 60,
      migrationStatus: "in-progress-unsafe",
      lineageTrustSeverity: "critical",
    },
    componentHealth: migratingCriticalHealth,
  },

  // Global-flip, flagged AND gated: the live mixing exposure still
  // exists (global-flip gave zero staged checkpoints — the blend
  // already happened), but it is both honestly visible and withheld
  // from being served further. This is still never acceptable — it is
  // listed here only to prove reportGateOnInconsistentLineage cannot
  // retroactively make an already-opaque global flip safe — it stops
  // the historical counter from accruing FURTHER but cannot undo the
  // all-at-once blend itself, which lineageConsistencyStatus keeps
  // reporting honestly.
  {
    id: "global-flip-flagged-gated",
    when: {
      triggerEquals: { migrationInProgress: true },
      controlEquals: {
        [CUTOVER_STRATEGY_KEY]: "global-flip",
        [LINEAGE_FLAGGING_KEY]: true,
        [REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY]: true,
      },
    },
    incidentState: "global-flip-flagged-gated",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 12,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 5,
      metricsWithMixedLineagePercent: 40,
      lineageConsistencyStatus: "inconsistent-flagged",
      cutoverAuditability: "opaque",
      reportGateStatus: "gated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 12,
      migrationStatus: "in-progress-unsafe",
      lineageTrustSeverity: "critical",
    },
    componentHealth: migratingCriticalHealth,
  },

  // Premature-decommission trap: an INDEPENDENT unsafe lever. Even on
  // top of an otherwise-staged migration, tearing down v1 before every
  // source has reached verified, fully-consistent v2 lineage
  // permanently removes the only reconciliation/rollback reference for
  // whatever is still mid-transition — never acceptable, proving the
  // trap is not reachable only through cutoverStrategy="global-flip".
  {
    id: "premature-decommission-trap",
    when: {
      triggerEquals: { migrationInProgress: true, sustainedUndecided: true },
      controlEquals: { [LEGACY_PATH_DECOMMISSION_KEY]: "decommission-v1" },
    },
    incidentState: "premature-decommission-trap",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 8,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 4,
      metricsWithMixedLineagePercent: 32,
      lineageConsistencyStatus: "inconsistent-silent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "decommissioned",
      reportsServedWhileInconsistentCount: 260,
      migrationStatus: "in-progress-unsafe",
      lineageTrustSeverity: "critical",
    },
    componentHealth: silentUnsafeHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH A — staged-per-source cutover. Protects
  // lineage consistency IMMEDIATELY for every already-cut-over source
  // (no blend ever exists for them), while sourcesCutOverCount climbs
  // gradually across real elapsed cutover windows. Listed before the
  // generic undecided baseline and before Path B so it is recognized as
  // a fully independent route to safety.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: full migration complete. Staged strategy + fully elapsed
  // cutover window — every source verified and cut over, zero mixed-
  // lineage metrics, zero inconsistent sources remaining.
  {
    id: "staged-fully-complete",
    when: {
      triggerEquals: { migrationInProgress: true, cutoverFullyCompleteElapsed: true },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "staged-per-source" },
    },
    incidentState: "staged-fully-complete",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 12,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 0,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "traceable",
      reportGateStatus: "gated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "complete",
      lineageTrustSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE tiers: staged cutover genuinely in progress, some
  // sources still mid-transition — zero metrics are EVER served mixed-
  // lineage without the pending sources being excluded, because staged
  // cutover never blends a source's own lineage; the sources that
  // haven't been reached yet simply stay on v1 cleanly until their
  // turn.
  {
    id: "staged-window2-audited",
    when: {
      triggerEquals: {
        migrationInProgress: true,
        sustainedUndecided: true,
        cutoverWindow2Elapsed: true,
        cutoverFullyCompleteElapsed: false,
      },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "staged-per-source", [CUTOVER_AUDIT_LOG_KEY]: true },
    },
    incidentState: "staged-window2",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 9,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 1,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "traceable",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },
  {
    id: "staged-window2",
    when: {
      triggerEquals: {
        migrationInProgress: true,
        sustainedUndecided: true,
        cutoverWindow2Elapsed: true,
        cutoverFullyCompleteElapsed: false,
      },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "staged-per-source" },
    },
    incidentState: "staged-window2",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 9,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 1,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },
  {
    id: "staged-window1-audited",
    when: {
      triggerEquals: {
        migrationInProgress: true,
        sustainedUndecided: true,
        cutoverWindow1Elapsed: true,
        cutoverWindow2Elapsed: false,
      },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "staged-per-source", [CUTOVER_AUDIT_LOG_KEY]: true },
    },
    incidentState: "staged-window1",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 5,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 1,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "traceable",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },
  {
    id: "staged-window1",
    when: {
      triggerEquals: {
        migrationInProgress: true,
        sustainedUndecided: true,
        cutoverWindow1Elapsed: true,
        cutoverWindow2Elapsed: false,
      },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "staged-per-source" },
    },
    incidentState: "staged-window1",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 5,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 1,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },

  // ── Just-engaged tick-zero proof: staged strategy chosen this instant
  // (no elapsed cutover window yet) — cut-over count is exactly what it
  // is at the moment staging started, proving progress is not instant.
  // Split on cutoverAuditLog (the "-audited" variant matched first, more
  // specific) so cutoverAuditability genuinely depends on the control
  // even at tick zero.
  {
    id: "staged-just-engaged-audited",
    when: {
      triggerEquals: { migrationInProgress: true, cutoverWindow1Elapsed: false },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "staged-per-source", [CUTOVER_AUDIT_LOG_KEY]: true },
    },
    incidentState: "staged-just-engaged",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 1,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 1,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "traceable",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },
  {
    id: "staged-just-engaged",
    when: {
      triggerEquals: { migrationInProgress: true, cutoverWindow1Elapsed: false },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "staged-per-source" },
    },
    incidentState: "staged-just-engaged",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 1,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 1,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH B — dual-write-reconcile cutover. Every
  // source runs v1 and v2 in parallel and is only declared cut over
  // once reconciled — strongest correctness guarantee, real ongoing
  // dual-compute cost. reconciliationDepth distinguishes "full"
  // (OPTIMAL-strength, catches value-level divergence) from "shallow"
  // (genuinely safe, never blended, but a real, honest lower-assurance
  // variant).
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: full migration complete, full reconciliation depth.
  {
    id: "dual-write-fully-complete-full-depth",
    when: {
      triggerEquals: { migrationInProgress: true, cutoverFullyCompleteElapsed: true },
      controlEquals: {
        [CUTOVER_STRATEGY_KEY]: "dual-write-reconcile",
        [RECONCILIATION_DEPTH_KEY]: "full",
      },
    },
    incidentState: "dual-write-fully-complete-full-depth",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 12,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 0,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "traceable",
      reportGateStatus: "gated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "complete",
      lineageTrustSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL-eligible but lower-assurance: full migration complete,
  // shallow reconciliation depth. Genuinely safe (zero mixed-lineage
  // metrics ever served) but a real, honest distinction from the
  // full-depth ceiling: shallow checks (row counts/basic checksums)
  // cannot catch a value-level divergence the way full depth does, so
  // this scores lower on dataIntegrity even though it also completes.
  {
    id: "dual-write-fully-complete-shallow-depth",
    when: {
      triggerEquals: { migrationInProgress: true, cutoverFullyCompleteElapsed: true },
      controlEquals: {
        [CUTOVER_STRATEGY_KEY]: "dual-write-reconcile",
        [RECONCILIATION_DEPTH_KEY]: "shallow",
      },
    },
    incidentState: "dual-write-fully-complete-shallow-depth",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 12,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 0,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "traceable",
      reportGateStatus: "gated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "complete",
      lineageTrustSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE tiers: dual-write-reconcile genuinely in progress —
  // sources not yet reconciled simply stay on v1 (dual-write means both
  // paths compute, but only the reconciled result is ever served), so
  // zero metrics are ever served mixed-lineage while reconciliation is
  // still underway.
  {
    id: "dual-write-window2-audited",
    when: {
      triggerEquals: {
        migrationInProgress: true,
        sustainedUndecided: true,
        cutoverWindow2Elapsed: true,
        cutoverFullyCompleteElapsed: false,
      },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "dual-write-reconcile", [CUTOVER_AUDIT_LOG_KEY]: true },
    },
    incidentState: "dual-write-window2",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 7,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 2,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "traceable",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },
  {
    id: "dual-write-window2",
    when: {
      triggerEquals: {
        migrationInProgress: true,
        sustainedUndecided: true,
        cutoverWindow2Elapsed: true,
        cutoverFullyCompleteElapsed: false,
      },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "dual-write-reconcile" },
    },
    incidentState: "dual-write-window2",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 7,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 2,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },
  {
    id: "dual-write-window1-audited",
    when: {
      triggerEquals: {
        migrationInProgress: true,
        sustainedUndecided: true,
        cutoverWindow1Elapsed: true,
        cutoverWindow2Elapsed: false,
      },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "dual-write-reconcile", [CUTOVER_AUDIT_LOG_KEY]: true },
    },
    incidentState: "dual-write-window1",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 3,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 3,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "traceable",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },
  {
    id: "dual-write-window1",
    when: {
      triggerEquals: {
        migrationInProgress: true,
        sustainedUndecided: true,
        cutoverWindow1Elapsed: true,
        cutoverWindow2Elapsed: false,
      },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "dual-write-reconcile" },
    },
    incidentState: "dual-write-window1",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 3,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 3,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },

  // ── Just-engaged tick-zero proof: dual-write-reconcile chosen this
  // instant (no elapsed cutover window yet) — reconciliation has not
  // had time to verify anything, proving progress is not instant. Split
  // on cutoverAuditLog (the "-audited" variant matched first, more
  // specific) so cutoverAuditability genuinely depends on the control
  // even at tick zero.
  {
    id: "dual-write-just-engaged-audited",
    when: {
      triggerEquals: { migrationInProgress: true, cutoverWindow1Elapsed: false },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "dual-write-reconcile", [CUTOVER_AUDIT_LOG_KEY]: true },
    },
    incidentState: "dual-write-just-engaged",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 0,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 4,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "traceable",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },
  {
    id: "dual-write-just-engaged",
    when: {
      triggerEquals: { migrationInProgress: true, cutoverWindow1Elapsed: false },
      controlEquals: { [CUTOVER_STRATEGY_KEY]: "dual-write-reconcile" },
    },
    incidentState: "dual-write-just-engaged",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 0,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 4,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "in-progress-safe",
      lineageTrustSeverity: "warning",
    },
    componentHealth: cuttingOverHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // NO DECISION / UNDECIDED — cutoverStrategy left at its
  // "not-yet-decided" default. Nothing has been flipped yet, so lineage
  // itself is still fully consistent (every source is still cleanly on
  // v1) — this is NOT a correctness violation, merely an avoidable
  // delay once sustained long enough. Listed after every real-strategy
  // rule above so an explicit candidate choice always takes priority.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "undecided-sustained",
    when: { triggerEquals: { migrationInProgress: true, sustainedUndecided: true } },
    incidentState: "undecided-sustained",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 0,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 0,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "not-started",
      lineageTrustSeverity: "warning",
    },
    componentHealth: migratingHealth,
  },
  {
    id: "undecided-active",
    when: { triggerEquals: { migrationInProgress: true } },
    incidentState: "undecided-active",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 0,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 0,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "not-started",
      lineageTrustSeverity: "normal",
    },
    componentHealth: migratingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      sourcesAvailabilityPercent: 100,
      warehouseWriteSuccessRate: 100,
      reportGenerationSuccessRate: 100,
      sourcesCutOverCount: 0,
      sourcesTotalCount: 12,
      sourcesInInconsistentStateCount: 0,
      metricsWithMixedLineagePercent: 0,
      lineageConsistencyStatus: "consistent",
      cutoverAuditability: "opaque",
      reportGateStatus: "ungated",
      legacyPathAvailability: "available",
      reportsServedWhileInconsistentCount: 0,
      migrationStatus: "not-started",
      lineageTrustSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
