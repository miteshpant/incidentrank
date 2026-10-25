import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Model Feature Freshness Degradation's scoring configuration.
 *
 * SCORING-INTERPRETATION CONSTRAINT (phase6e2.md section 11, binding for
 * this scenario specifically): dataIntegrity/reliability/customerImpact
 * measure DECISION-QUALITY RISK here, never classic data corruption or
 * serving uptime/latency. modelServingUptimePercent/
 * decisionApiP99LatencyMs never move in any rule (see rules.ts) and are
 * never read by any scoring measure below — rewarding/penalizing them
 * would silently turn this back into a generic availability scenario,
 * exactly what this scenario must not become.
 *
 *   - dataIntegrity: penalties mode against the two closed-enum
 *     string-state fields authored specifically for this judgment —
 *     freshnessStatus ("fresh" / "critical-at-risk") and
 *     decisionRiskStatus ("healthy" / "safe-degraded" /
 *     "quality-compromised"). A path where a critical decision was ever
 *     computed from stale data ("quality-compromised") loses
 *     substantially more credit than a safe-degraded tradeoff, which
 *     itself loses a modest, real amount relative to fully "healthy".
 *   - reliability: criticalTimeRatio against decisionQualitySeverity
 *     (a severityField using the engine's normal/warning/critical
 *     vocabulary) — time spent with DECISION QUALITY genuinely at risk,
 *     never time spent with serving itself unavailable or slow (Model
 *     Serving/Decision API never carry a severity field in this
 *     scenario at all).
 *   - customerImpact: revenueLossUsd, sized in revenue-and-cost.ts by
 *     how unsafe/degraded decision quality is in each state — the
 *     silent-permissive and offline-snapshot traps lose the MOST
 *     despite having the best-looking uptime/latency of any state.
 *   - costEfficiency: costIncreaseRatio — genuinely first-class here:
 *     fresh-fallback routing (ongoing extra model-serving compute) and
 *     the held+bounded path (zero extra serving compute, a bounded
 *     decision-hold cost instead) are both fully safe but land at
 *     materially different infrastructure spend; featureRefreshPolicy=
 *     "aggressive" is a further independent cost lever on top of either.
 */
export const MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band widths calibrated to this scenario's real authored
      // timeline: the fastest genuine OPTIMAL resolution via the
      // fresh-fallback path is near-instant (no drain lag at all); the
      // fastest genuine OPTIMAL via the held+bounded+prioritized path
      // requires the full drain window on top of sustained-lag onset
      // (recoveryTimeSeconds ~ 740-780s). The top band must extend far
      // enough to include the slower-but-equally-OPTIMAL path, so
      // dataIntegrity (not recovery) is what separates "silently
      // unsafe" from "genuinely safe," never recovery time alone.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 850, points: 260 },
        { atMost: 1_100, points: 170 },
        { atMost: 1_500, points: 90 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 300, points: 200 },
        { atMost: 800, points: 160 },
        { atMost: 1_600, points: 110 },
        { atMost: 3_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment: penalties mode on two closed-enum
      // decision-quality string-state fields. A fully "healthy" path
      // (fully-recovered-held-prioritized) keeps full credit. A
      // "safe-degraded" path (fresh-fallback, or held+bounded while
      // still draining) — genuinely safe, zero stale critical
      // decisions ever served — loses a modest, real amount relative
      // to full recovery. A "quality-compromised" exposure (the
      // baseline/no-mitigation path — honestly flagged by strict
      // fallback mode, but still genuinely served to critical
      // decisions) loses substantially more. "quality-compromised-
      // silent" (the silent-permissive / offline-snapshot traps —
      // identical staleness exposure PLUS zero visibility anywhere in
      // the system) loses the most of all — this scenario must never
      // let either compromised variant look "almost optimal," and the
      // silent variant must score strictly worse than the honestly-
      // flagged baseline despite both having identical
      // modelServingUptimePercent/decisionApiP99LatencyMs.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "decisionRiskStatus", value: "safe-degraded" },
          atLeast: 1,
          subtractPoints: 45,
        },
        {
          measure: { type: "finalStringEquals", field: "freshnessStatus", value: "critical-at-risk" },
          atLeast: 1,
          subtractPoints: 70,
        },
        {
          measure: { type: "finalStringEquals", field: "decisionRiskStatus", value: "quality-compromised" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "decisionRiskStatus", value: "quality-compromised-silent" },
          atLeast: 1,
          subtractPoints: 110,
        },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.1, points: 150 },
        { atMost: 0.25, points: 115 },
        { atMost: 0.45, points: 80 },
        { atMost: 0.65, points: 45 },
        { points: 15 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.3, points: 80 },
        { atMost: 0.6, points: 55 },
        { atMost: 1.2, points: 25 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 8, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 12, subtractPoints: 10 },
      ],
    },
  ],
};
