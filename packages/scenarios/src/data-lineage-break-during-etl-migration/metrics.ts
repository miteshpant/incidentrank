import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Live-availability health (the DECOY signal) ─────────────────────
  // Sources, Warehouse, and Reports all stay fully available the ENTIRE
  // incident, by design — the root cause is a migration-induced lineage
  // inconsistency, never an availability failure. A candidate who only
  // watches these never discovers anything is wrong: dashboards render,
  // reports generate, nothing is down. This is the scenario's core
  // product claim (phase6e3.md): numbers remain "available," trust does
  // not.
  sourcesAvailabilityPercent: 100,
  warehouseWriteSuccessRate: 100,
  reportGenerationSuccessRate: 100,

  // ── Migration progress (context, not itself the judgment) ──────────
  // How many of the sources feeding the Warehouse have been fully cut
  // over to ETL v2 (lineage fully on v2, verified, no longer blended
  // with v1). 0 at migration start; climbs toward sourcesTotalCount only
  // through real, authored mechanics in rules.ts tied to cutover
  // strategy and elapsed time — never an instant jump.
  sourcesCutOverCount: 0,
  // Fixed business context: total number of sources this migration
  // covers. Not a lever — read-only state a candidate must account for.
  sourcesTotalCount: 12,
  // How many sources are CURRENTLY in an inconsistent state: cut over on
  // one path but still partially blended with the other, or mid-
  // reconciliation. 0 before migration starts and after it fully
  // completes; nonzero while any source is actively transitioning.
  sourcesInInconsistentStateCount: 0,

  // ── Lineage-consistency judgment (business invariants #1/#3) ───────
  // Percent of metrics CURRENTLY computed from a mix of v1-derived and
  // v2-derived data within the same computed value (as opposed to
  // cleanly sourced from exactly one path). 0 is fully consistent. This
  // is the central correctness measure — a metric blending both paths
  // is never acceptable, however healthy availability looks.
  metricsWithMixedLineagePercent: 0,
  // Whether stakeholders consuming a currently-inconsistent metric can
  // actually tell (a visible untrusted/flagged state) or are being
  // silently served a wrong number with full confidence styling —
  // business invariant #3. Read by scoring/success conditions as the
  // single authoritative lineage-visibility summary.
  //   "consistent"            — no metric is currently mixed-lineage, by
  //                              any path.
  //   "inconsistent-flagged"  — some metric(s) are currently mixed-
  //                              lineage, but the exposure is HONESTLY
  //                              FLAGGED (lineageFlagging=true) —
  //                              stakeholders can see it is untrusted.
  //   "inconsistent-silent"   — the same live inconsistency, but with
  //                              zero visibility anywhere (lineageFlagging
  //                              off, or the premature-decommission
  //                              trap) — strictly worse than the
  //                              honestly-flagged variant despite
  //                              identical availability numbers.
  lineageConsistencyStatus: "consistent",

  // ── Candidate-visible cutover/audit signals (state, not controls) ───
  // Whether the migration's per-step cutover record is currently
  // traceable per source/metric (cutoverAuditLog engaged) or opaque.
  //   "traceable" — every cutover step is individually auditable.
  //   "opaque"    — cutover happened with no durable per-step record.
  cutoverAuditability: "opaque",
  // Whether reports currently being served are gated on lineage
  // consistency (reportGateOnInconsistentLineage engaged) or served
  // regardless of lineage state.
  //   "gated"      — a report whose lineage is not fully consistent is
  //                   withheld/blocked rather than served as trusted.
  //   "ungated"    — every report is served on request regardless of
  //                   lineage consistency.
  reportGateStatus: "ungated",
  // Whether ETL v1 is still reachable as a reconciliation/rollback
  // reference path.
  //   "available"     — v1 still running, reachable for reconciliation
  //                       or rollback.
  //   "decommissioned" — v1 has been torn down.
  legacyPathAvailability: "available",

  // ── Historical / cumulative damage (phase6e3.md's doctrine) ─────────
  // Cumulative count of reports actually SERVED to stakeholders while
  // their full lineage path was inconsistent during this attempt. This
  // can only ever increase while exposure is active — there is no
  // control, mode, or elapsed time that reduces it. A report already
  // served with a silently-wrong number is a real, permanent trust
  // exposure, not a recoverable backlog state. See rules.ts/
  // definition.ts's numericWatchFields (trackPeak: true).
  reportsServedWhileInconsistentCount: 0,

  // ── Summary string-state field (read by scoring + success/acceptable
  // conditions as the single authoritative overall-migration summary) ──
  //   "not-started"  — migration has not begun yet.
  //   "in-progress-safe" — migration underway, zero mixed-lineage
  //                        metrics have EVER been served unflagged/
  //                        unguarded; a deliberate, bounded, honestly
  //                        tracked tradeoff may be active.
  //   "in-progress-unsafe" — migration underway, mixed-lineage metrics
  //                          are currently exposed without adequate
  //                          flagging/gating.
  //   "complete" — every source fully cut over to v2, verified, zero
  //               inconsistency remaining.
  migrationStatus: "not-started",

  // Severity-field summary (normal/warning/critical vocabulary only, per
  // SeverityFieldConfig) of LINEAGE-TRUST risk specifically — deliberately
  // independent of Sources/Warehouse/Reports availability, which never
  // leave "healthy" componentHealth in this scenario. This drives
  // reliability's criticalTimeRatio measure: time spent with lineage
  // trust genuinely at risk, never time spent with availability itself
  // degraded.
  lineageTrustSeverity: "normal",
};
