import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How the ETL v1 -> v2 migration is actually cut over, once the
 * migration itself is underway (see timed-events.ts — the migration
 * being in progress at all is fixed incident context, not a candidate
 * choice). "not-yet-decided" (default) is the state the instant the
 * migration begins, before the candidate has made any cutover-strategy
 * decision at all — nothing has been flipped yet, so no source has
 * inconsistent lineage, but a decision is now required. "global-flip"
 * is the fast, tempting unsafe lever: a single switch routes ALL
 * sources/metrics to v2 at once, the instant v2 "looks like it's
 * working" (passes a shallow smoke test). It is never structurally
 * unsafe by itself to run v2 — the danger is that a global, all-at-once
 * flip gives every downstream metric and report NO staged, auditable
 * checkpoint: if v1 and v2 diverge for even one source, every metric
 * that blends data from multiple sources is now silently mixed
 * v1-derived and v2-derived with no rollback point narrower than "revert
 * everything." "staged-per-source" cuts over one source at a time, in
 * controlled, auditable stages — ALTERNATE STRONG PATH A: slower, but
 * each stage is independently verifiable and independently
 * rollback-able, and lineage per source is always exactly one of v1 or
 * v2, never a blend. "dual-write-reconcile" runs v1 and v2 in parallel
 * for every source, reconciles their outputs, and only declares a
 * source cut over once v2 has been PROVEN to match v1 within tolerance —
 * ALTERNATE STRONG PATH B: slower still (real, ongoing dual-compute
 * cost) but the strongest correctness guarantee, since cutover is
 * evidence-based rather than assumed from a smoke test.
 */
export const CUTOVER_STRATEGY_KEY = "cutoverStrategy";

/**
 * Whether a metric/report currently computed from an inconsistent mix of
 * v1- and v2-derived lineage (or from a source whose cutover has not yet
 * completed verification) is visibly flagged untrusted. "off" (default)
 * serves every number with full, unflagged confidence styling regardless
 * of lineage consistency — stakeholders cannot tell a trustworthy number
 * from a currently-inconsistent one. "on" makes lineageConsistencyStatus
 * and reportTrustStatus visibly read their real state instead of a false
 * "healthy" — a required precondition for any real remediation, since
 * nothing downstream can protect stakeholders from a risk it cannot see.
 * This control alone does not stop inconsistent lineage from existing —
 * cutoverStrategy and reportGateOnInconsistentLineage are what actually
 * prevent or contain it.
 */
export const LINEAGE_FLAGGING_KEY = "lineageFlagging";

/**
 * Whether each per-source/per-metric cutover step is recorded in an
 * auditable, traceable log (which source, which metric, v1-or-v2, when,
 * verified how). "off" (default) performs cutover with no durable
 * per-step record — even a staged, well-intentioned migration becomes an
 * opaque sequence of flips after the fact, impossible to audit if a
 * divergence is later discovered. "on" keeps a real auditable trail —
 * required for business invariant #2 (cutover must be traceable and
 * auditable per source/metric, never an opaque global flip) regardless
 * of which cutoverStrategy is chosen.
 */
export const CUTOVER_AUDIT_LOG_KEY = "cutoverAuditLog";

/**
 * Whether a report/metric whose full lineage path is not yet fully
 * consistent is actually GATED (held back from being served as a
 * trusted number) rather than merely flagged. "off" (default) still
 * serves the report on request even when lineageFlagging has correctly
 * identified it as inconsistent — stakeholders can see the flag if
 * lineageFlagging is on, but the report goes out anyway. "on" withholds
 * (or serves with a hard untrusted banner that blocks automated
 * consumption) any report whose lineage is not yet fully consistent —
 * the real lever, together with lineageFlagging, that keeps
 * reportsServedWhileInconsistentCount from accruing further, at the
 * real cost of some reports being delayed until their lineage fully
 * settles.
 */
export const REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY = "reportGateOnInconsistentLineage";

/**
 * Only meaningful while cutoverStrategy is "dual-write-reconcile": how
 * thoroughly v1 and v2 outputs are cross-checked before a source is
 * declared cut over. "shallow" (default) only compares row counts/basic
 * checksums — fast, but can miss a real value-level divergence between
 * v1 and v2 for the same source. "full" compares actual computed values
 * field-by-field before declaring a source reconciled — genuinely slower
 * (more reconciliation compute, see revenue-and-cost.ts) but the
 * strongest version of Alternate Strong Path B, since it can actually
 * catch a v1/v2 value-level divergence that a shallow check would miss.
 */
export const RECONCILIATION_DEPTH_KEY = "reconciliationDepth";

/**
 * Whether ETL v1 has been torn down. "keep-both" (default) keeps v1
 * running and reachable for as long as the migration is in progress —
 * real, ongoing dual-infrastructure cost, but it preserves the ability
 * to reconcile against v1 or roll a source back to it at any point.
 * "decommission-v1" looks like a clean, decisive way to stop paying for
 * two pipelines and declare the migration "done" — but decommissioning
 * v1 BEFORE every source has a verified, fully-consistent v2 lineage
 * permanently removes the only reference path that could have caught or
 * rolled back a divergence for whichever sources were not yet verified.
 * This is the scenario's second, independent unsafe trap (distinct from
 * global-flip): it can be reached even on top of an otherwise-staged
 * migration, proving the trap is not only reachable through one
 * specific lever.
 */
export const LEGACY_PATH_DECOMMISSION_KEY = "legacyPathDecommission";

export const controls: ControlDefinition[] = [
  {
    key: CUTOVER_STRATEGY_KEY,
    allowedValues: ["not-yet-decided", "global-flip", "staged-per-source", "dual-write-reconcile"],
    initialValue: "not-yet-decided",
  },
  {
    key: LINEAGE_FLAGGING_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CUTOVER_AUDIT_LOG_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: RECONCILIATION_DEPTH_KEY,
    allowedValues: ["shallow", "full"],
    initialValue: "shallow",
  },
  {
    key: LEGACY_PATH_DECOMMISSION_KEY,
    allowedValues: ["keep-both", "decommission-v1"],
    initialValue: "keep-both",
  },
];
