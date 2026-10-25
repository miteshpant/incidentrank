import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Live-traffic health (the DECOY signal) ──────────────────────────
  // Model Serving and Decision API stay healthy/fast the ENTIRE
  // incident, by design — the root cause is a Feature Pipeline lag, not
  // a serving-layer failure. A candidate who only watches these two
  // numbers never discovers anything is wrong. This is the scenario's
  // core product claim (phase6e2.md): uptime green, decision quality
  // degrading.
  modelServingUptimePercent: 99.95,
  decisionApiP99LatencyMs: 85,

  // ── Feature freshness (the REAL problem) ────────────────────────────
  // Seconds since the Feature Pipeline last recomputed feature values
  // from Source Data. Zero is fresh. Climbs once the incident starts;
  // whether and how fast it drains depends on real, authored mechanics
  // in rules.ts, never an instant reset.
  featurePipelineLagSeconds: 0,
  // Seconds since the oldest feature currently being served by the
  // Feature Store was last refreshed. This is what Model Serving
  // actually reads from — distinct from pipeline lag because it is the
  // SERVED age, not merely the computation backlog.
  featureFreshnessAgeSeconds: 5,
  // Percent of Feature Store availability — the Feature Store itself
  // never goes down in this incident; only the AGE of what it serves
  // degrades. Kept separate from uptime/latency to make unmistakably
  // clear this is not an availability incident.
  featureStoreAvailabilityPercent: 100,

  // ── Decision-quality judgment (business invariants #1/#2/#5) ────────
  // 0-100 proxy for how trustworthy current decisions are, as a
  // function of which features (how stale) are feeding them. 100 is
  // fully healthy. This is the dimension that must do the real
  // dataIntegrity/reliability work in scoring (phase6e2.md section 11's
  // scoring-interpretation constraint) — NOT a classic data-corruption
  // or uptime measure.
  decisionQualityScore: 100,
  // Percent of ALL decisions (critical and non-critical) currently being
  // computed from features past the authored staleness bound.
  staleFeaturePercent: 0,
  // Percent of CRITICAL decisions specifically currently being computed
  // from features past the authored staleness bound — the number that
  // actually matters for the scenario's central judgment, since business
  // invariant #2 only forbids this for CRITICAL decisions.
  staleFeaturePercentOnCriticalDecisions: 0,
  // How many decisions-per-minute are currently classified CRITICAL
  // (vs. low-risk, which may tolerate bounded staleness). Fixed
  // business context, not a lever — read-only state a candidate must
  // account for.
  criticalDecisionVolumePerMinute: 40,

  // ── Candidate-visible fallback/hold signals (state, not controls) ───
  // Whether Model Serving is currently using the fresh-fallback model
  // (modelRouting = "fresh-fallback") for any traffic.
  fallbackModelUsagePercent: 0,
  // How many CRITICAL decisions per minute are currently being held
  // rather than answered, because criticalDecisionHold is engaged and
  // staleness has crossed the bound. 0 is normal/healthy UNLESS
  // staleness is also high, in which case 0 held + stale features
  // flowing through is the dangerous combination.
  criticalDecisionsHeldPerMinute: 0,

  // ── Historical / cumulative damage (phase6e2.md's doctrine) ─────────
  // Cumulative count of CRITICAL decisions that were actually computed
  // from features past the staleness bound during this attempt. This
  // can only ever increase while exposure is active — there is no
  // control, mode, or elapsed time that reduces it. A bad decision
  // already made on stale data is a real, permanent business-risk
  // exposure, not a recoverable backlog state. See rules.ts /
  // definition.ts's numericWatchFields (trackPeak: true).
  cumulativeStaleCriticalDecisionCount: 0,

  // ── Summary string-state fields (read by scoring + success/acceptable
  // conditions as the single authoritative summaries) ─────────────────
  //   "fresh"              — no critical decision is currently being
  //                           computed from stale features, by any path.
  //   "critical-at-risk"   — critical decisions are currently being
  //                           computed from features past the bound
  //                           (live violation, right now).
  freshnessStatus: "fresh",
  //   "healthy"        — decision quality fully protected, no tradeoff.
  //   "safe-degraded"  — a deliberate, bounded tradeoff is active
  //                       (fresh-fallback and/or held critical decisions)
  //                       but zero critical decisions are being computed
  //                       from stale features.
  //   "quality-compromised" — critical decisions are currently being
  //                       computed from stale features, but the
  //                       exposure is at least HONESTLY FLAGGED
  //                       (featureFallbackMode="strict") — the
  //                       no-mitigation baseline. Never resolves as
  //                       safe while this holds, regardless of uptime/
  //                       latency.
  //   "quality-compromised-silent" — the same live staleness exposure,
  //                       PLUS zero visibility anywhere in the system
  //                       (silent-permissive fallback, or the offline-
  //                       snapshot trap) — strictly worse than the
  //                       honestly-flagged variant above despite
  //                       identical serving-health numbers (see
  //                       scoring.ts's dataIntegrity penalties).
  decisionRiskStatus: "healthy",

  // Severity-field summary (normal/warning/critical vocabulary only,
  // per SeverityFieldConfig) of decision-QUALITY risk specifically —
  // deliberately independent of Model Serving/Decision API, which never
  // leave "healthy" componentHealth in this scenario. This is what
  // drives reliability's criticalTimeRatio measure: time spent with
  // critical decisions genuinely exposed to stale data, never time
  // spent with serving itself unavailable or slow.
  decisionQualitySeverity: "normal",
};
