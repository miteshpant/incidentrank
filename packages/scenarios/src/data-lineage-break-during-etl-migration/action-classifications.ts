import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CUTOVER_AUDIT_LOG_KEY,
  CUTOVER_STRATEGY_KEY,
  LEGACY_PATH_DECOMMISSION_KEY,
  LINEAGE_FLAGGING_KEY,
  RECONCILIATION_DEPTH_KEY,
  REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── cutoverStrategy ──────────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: CUTOVER_STRATEGY_KEY,
    valueEquals: "global-flip",
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "harmful",
    feedback: {
      title: "Global flip cut over every source at once with no staged checkpoint",
      explanation:
        "Routing every source to ETL v2 in a single switch made this look fast and decisive — sourcesAvailabilityPercent, warehouseWriteSuccessRate, and reportGenerationSuccessRate stayed identical to every safe path. That apparent calm is not real: a global, all-at-once flip gives every downstream metric and report zero staged, auditable checkpoint. If v1 and v2 diverge for even one source, every metric that blends data from multiple sources is now silently mixed v1-derived and v2-derived with no rollback point narrower than reverting the entire migration. Every tick this stayed active added to a permanent, non-resetting count of reports served while lineage was inconsistent, which stays on the record even after you revert, and materially penalizes Data Integrity and Reliability regardless of how healthy availability looked.",
    },
  },
  {
    id: "acc_2",
    controlKey: CUTOVER_STRATEGY_KEY,
    valueEquals: "staged-per-source",
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Staged per-source cutover kept every source's lineage clean at every stage",
      explanation:
        "Cutting over one source at a time, in controlled, auditable stages, is one of this scenario's two legitimate alternate strong paths. Each source's lineage is always exactly one of v1 or v2, never a blend, at every point in the migration — sources not yet reached simply stay cleanly on v1 until their turn. It protects lineage consistency immediately for every source already cut over, at the real cost of a slower overall migration than flipping everything at once.",
    },
  },
  {
    id: "acc_3",
    controlKey: CUTOVER_STRATEGY_KEY,
    valueEquals: "dual-write-reconcile",
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Dual-write-reconcile proved each source's cutover with evidence instead of a smoke test",
      explanation:
        "Running v1 and v2 in parallel for every source and only declaring a source cut over once v2 is proven to match v1 within tolerance is this scenario's other legitimate alternate strong path. Sources not yet reconciled simply stay on v1 cleanly — nothing is ever served as a blend. It is the strongest correctness guarantee available, at a real, ongoing dual-compute cost for as long as both paths run (see reconciliationDepth for how thoroughly that proof is checked).",
    },
  },
  {
    id: "acc_4",
    controlKey: CUTOVER_STRATEGY_KEY,
    valueEquals: "not-yet-decided",
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the cutover strategy undecided avoids any lineage exposure but stalls the migration",
      explanation:
        "With no cutover strategy chosen yet, every source remains cleanly on v1 — lineage stays fully consistent, so this is never itself a correctness violation. But the migration cannot progress while this decision stays open, and leaving it unresolved for too long is a real, avoidable delay this scenario treats as a cost, not as safety.",
    },
  },

  // ── lineageFlagging ──────────────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: LINEAGE_FLAGGING_KEY,
    valueEquals: true,
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Lineage flagging made inconsistent metrics visibly untrusted instead of silent",
      explanation:
        "Turning on lineage flagging means a metric or report currently computed from an inconsistent mix of v1/v2 lineage is explicitly marked untrusted — lineageConsistencyStatus correctly reports inconsistent-flagged instead of a false consistent reading whenever a real mix exists. This does not, by itself, stop the exposure (reportGateOnInconsistentLineage is what actually blocks it from being served) — but it is a required precondition for any real remediation, since stakeholders cannot protect themselves from a risk they cannot see.",
    },
  },
  {
    id: "acc_6",
    controlKey: LINEAGE_FLAGGING_KEY,
    valueEquals: false,
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "harmful",
    feedback: {
      title: "Leaving lineage flagging off let inconsistent numbers look fully trustworthy",
      explanation:
        "With lineage flagging off, any metric currently computed from mixed v1/v2 lineage is served with full, unflagged confidence styling — stakeholders have no way to tell a trustworthy number from a currently-inconsistent one. Combined with an unsafe cutover strategy, this is what makes the exposure silent rather than merely present, and is a required precondition for this scenario's primary trap.",
    },
  },

  // ── reportGateOnInconsistentLineage ──────────────────────────────────
  {
    id: "acc_7",
    controlKey: REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
    valueEquals: true,
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Gating reports on lineage consistency stopped further inconsistent reports from being served",
      explanation:
        "Withholding (or hard-blocking) any report whose full lineage path is not yet fully consistent is the real lever, together with lineage flagging, that keeps reportsServedWhileInconsistentCount from accruing further. It does not retroactively fix reports already served before this was engaged, and it has a real cost: some reports are delayed until their lineage fully settles.",
    },
  },
  {
    id: "acc_8",
    controlKey: REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
    valueEquals: false,
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the report gate off means inconsistent reports still go out, flagged or not",
      explanation:
        "With the report gate off, a report is served on request regardless of lineage consistency — even if lineage flagging has correctly identified it as inconsistent, the report goes out anyway. Not independently unsafe when lineage is genuinely consistent, but it leaves no safety net the moment it is not.",
    },
  },

  // ── cutoverAuditLog ──────────────────────────────────────────────────
  {
    id: "acc_9",
    controlKey: CUTOVER_AUDIT_LOG_KEY,
    valueEquals: true,
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Auditable cutover logging made each per-source migration step traceable",
      explanation:
        "Recording each per-source/per-metric cutover step (which source, which path, when, verified how) is what satisfies business invariant #2: cutover must be traceable and auditable per source/metric, never an opaque global flip. Within an in-progress staged-per-source or dual-write-reconcile migration, this makes cutoverAuditability genuinely read traceable instead of opaque while sources are still mid-transition, which carries a small, real Data Integrity credit on top of the strategy itself — modest by design, since the primary judgment here is the cutover strategy, not this auditability lever. It is also what makes a later divergence investigation possible at all.",
    },
  },
  {
    id: "acc_10",
    controlKey: CUTOVER_AUDIT_LOG_KEY,
    valueEquals: false,
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving cutover logging off makes even a well-intentioned migration opaque after the fact",
      explanation:
        "Without a durable per-step record, even a staged, careful migration becomes an opaque sequence of flips after the fact — impossible to audit if a divergence is later discovered. cutoverAuditability keeps reading opaque while sources are mid-transition, which costs a small, real amount of Data Integrity credit relative to recording the trail. Not itself a live lineage-mixing correctness violation (the strategy itself still governs that), but it is a real, avoidable gap in auditability with a real, if modest, scoring consequence.",
    },
  },

  // ── reconciliationDepth ──────────────────────────────────────────────
  {
    id: "acc_11",
    controlKey: RECONCILIATION_DEPTH_KEY,
    valueEquals: "full",
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Full reconciliation depth verified actual values, not just row counts",
      explanation:
        "Comparing v1 and v2 outputs field-by-field (only meaningful once cutoverStrategy is dual-write-reconcile) is the strongest version of that alternate path — it can catch a real value-level divergence between v1 and v2 for the same source that a shallow row-count/checksum check would miss. Genuinely slower (more reconciliation compute) but the highest-assurance route to a verified cutover.",
    },
  },
  {
    id: "acc_12",
    controlKey: RECONCILIATION_DEPTH_KEY,
    valueEquals: "shallow",
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "neutral",
    feedback: {
      title: "Shallow reconciliation is still safe but carries a real, honest lower-assurance gap",
      explanation:
        "Comparing only row counts and basic checksums (only meaningful once cutoverStrategy is dual-write-reconcile) never serves a blended value — a source is still only declared cut over once it passes this check — but it can miss a real value-level divergence that full reconciliation would catch. A genuine, honest quality/cost tradeoff within an already-safe path, never a correctness violation by itself.",
    },
  },

  // ── legacyPathDecommission ───────────────────────────────────────────
  {
    id: "acc_13",
    controlKey: LEGACY_PATH_DECOMMISSION_KEY,
    valueEquals: "decommission-v1",
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "harmful",
    feedback: {
      title: "Decommissioning v1 early destroyed the only reconciliation/rollback reference for unverified sources",
      explanation:
        "Tearing down ETL v1 looks like a clean, decisive way to stop paying for two pipelines and declare the migration done — but doing so before every source has reached a verified, fully-consistent v2 lineage permanently removes the only reference path that could have caught or rolled back a divergence for whichever sources were not yet verified. This is an independent unsafe trap from global-flip — it can be reached even on top of an otherwise-staged migration — and accrues the same permanent, non-resetting exposure count.",
    },
  },
  {
    id: "acc_14",
    controlKey: LEGACY_PATH_DECOMMISSION_KEY,
    valueEquals: "keep-both",
    whenTriggerEquals: { migrationInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping both ETL paths available preserved a real reconciliation and rollback reference",
      explanation:
        "Keeping v1 running and reachable for as long as the migration is in progress is a real, ongoing dual-infrastructure cost, but it preserves the ability to reconcile against v1 or roll any source back to it at any point — never substituting assumed correctness for a verifiable reference while sources remain unverified.",
    },
  },
];
