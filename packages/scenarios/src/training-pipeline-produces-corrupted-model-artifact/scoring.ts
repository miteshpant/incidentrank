import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Training Pipeline Produces Corrupted Model Artifact's scoring
 * configuration.
 *
 * SCORING-INTERPRETATION CONSTRAINT (same binding pattern as Model
 * Feature Freshness Degradation / Privilege Escalation via Stale
 * Authorization Cache): dataIntegrity/reliability/customerImpact
 * measure ARTIFACT-TRUST AND LINEAGE risk here, never classic
 * infrastructure uptime/latency. trainingPipelineSuccessRate/
 * deploymentPipelineUptimePercent never move in any rule (see
 * rules.ts) and are never read by any scoring measure below —
 * rewarding/penalizing them would silently turn this back into a
 * generic infrastructure-failure scenario, exactly what this scenario
 * must not become.
 *
 *   - dataIntegrity: penalties mode against the two closed-enum
 *     string-state fields authored specifically for this judgment —
 *     artifactRiskStatus ("healthy" / "safe-quarantined" /
 *     "corrupted-exposure" / "lineage-destroyed") and
 *     lineageAuditStatus ("complete" / "compromised"). A path where
 *     lineage was ever permanently destroyed loses the single largest
 *     penalty in the entire scenario — strictly worse than an ongoing
 *     live exposure that was at least never actively hidden, mirroring
 *     this batch's required unsafe-tempting-path design (the trap does
 *     not even need corruption to still be live to be the worst
 *     outcome).
 *   - reliability: criticalTimeRatio against artifactTrustSeverity (a
 *     severityField using the engine's normal/warning/critical
 *     vocabulary) — time spent with a corrupted artifact genuinely
 *     serving live traffic, never time spent with infrastructure
 *     itself unavailable or slow (Trainer/Deployment Pipeline never
 *     carry a severity field in this scenario at all).
 *   - customerImpact: revenueLossUsd, sized in revenue-and-cost.ts by
 *     how exposed/unsafe the artifact-trust state is in each state —
 *     the lineage-destroyed trap loses heavily despite having already
 *     pulled the artifact from serving, because the business can no
 *     longer prove what happened.
 *   - costEfficiency: costIncreaseRatio — genuinely discriminating
 *     here (unlike Cross-Region Replication Cost Explosion's baseline-
 *     only-ever-decreases case): hold-for-retrain and the heavy
 *     validation tier both only ever ADD real ongoing spend above this
 *     scenario's baseline, so peak-vs-baseline correctly separates the
 *     free immediate rollback path from the costlier hold-for-retrain
 *     path and the optional heavier validation tier on top of either.
 */
export const TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band widths calibrated to this scenario's real authored
      // timeline: the fastest genuine OPTIMAL resolution via the
      // last-known-good rollback path is near-instant (no retrain lag
      // at all); the fastest genuine OPTIMAL via hold-for-retrain
      // requires the full retrain-and-validate window on top of
      // sustained-exposure onset (recoveryTimeSeconds ~ 740-800s). The
      // top band must extend far enough to include the slower-but-
      // equally-OPTIMAL path, so dataIntegrity (not recovery) is what
      // separates "silently unsafe" from "genuinely safe," never
      // recovery time alone.
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
        { atMost: 200, points: 200 },
        { atMost: 600, points: 160 },
        { atMost: 1_400, points: 110 },
        { atMost: 2_800, points: 60 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment: penalties mode on two closed-enum
      // artifact-trust/lineage string-state fields. A fully "healthy"
      // path (rollback or retrain fully closed-loop) keeps full
      // credit. A "safe-quarantined" path (corrupted artifact pulled
      // but the gate/marking loop not yet fully closed, or mid-retrain
      // drain) — genuinely safe, zero corrupted output ever served
      // after quarantine — loses a modest, real amount relative to
      // full recovery. A "corrupted-exposure" violation (the
      // keep-serving baseline) loses substantially more. The
      // "lineage-destroyed" trap loses the MOST of all — this
      // scenario must never let it look "almost optimal" merely
      // because the live serving field also reads "quarantined."
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "artifactRiskStatus", value: "safe-quarantined" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          measure: { type: "finalStringEquals", field: "artifactRiskStatus", value: "corrupted-exposure" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "lineageAuditStatus", value: "compromised" },
          atLeast: 1,
          subtractPoints: 150,
        },
        {
          measure: { type: "finalStringEquals", field: "artifactRiskStatus", value: "lineage-destroyed" },
          atLeast: 1,
          subtractPoints: 40,
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
        { atMost: 0.2, points: 80 },
        { atMost: 0.4, points: 55 },
        { atMost: 0.8, points: 25 },
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
