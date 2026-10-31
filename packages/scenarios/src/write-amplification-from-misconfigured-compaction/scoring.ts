import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Write Amplification from Misconfigured Storage Compaction's scoring
 * configuration. Every dimension uses the same generic, data-driven
 * scorer every other scenario uses (packages/scenarios/src/authoring/
 * score.ts) — zero new scoring logic was added for this scenario, per
 * the binding "zero slug branching" scoring architecture decision
 * (see MEMORY.md's phase6_scoring_architecture note).
 *
 * maxPoints per dimension is the fixed catalog-wide split every built-in
 * and org-authored scenario uses: recovery=300, customerImpact=200,
 * dataIntegrity=200, reliability=150, costEfficiency=100,
 * operationalEfficiency=50 (sums to 1000). See
 * checkout-payment-inventory-redis-contention/scoring.ts's own doc
 * comment for the historical Phase 10F/10G correction this split fixed.
 *
 * Investigation quality — whether the candidate correlated disk IOPS,
 * write amplification, AND compaction config history before applying
 * the fix ("correlated-then-fixed"), applied the correct fix without
 * demonstrating that correlation ("guessed-fix"), chased one of the two
 * plausible-but-inferior remediations, or did nothing — is scored
 * explicitly via the existing `finalStringEquals` measure against the
 * `diagnosisPath` state value rules.ts authors directly, exactly as the
 * reference incident and Kafka Partition Skew's orderingMode tradeoff
 * already do. Never inferred from roleInIncident tags, which are
 * reserved for the post-incident narrative only.
 */
export const WRITE_AMPLIFICATION_FROM_MISCONFIGURED_COMPACTION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 240 },
        { atMost: 240, points: 180 },
        { atMost: 360, points: 110 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 8_000, points: 200 },
        { atMost: 20_000, points: 150 },
        { atMost: 40_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored investigation-quality scoring — see this
      // file's top-level doc comment. Every value is a literal rules.ts
      // authors by hand, never derived from roleInIncident.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "diagnosisPath", value: "correlated-then-fixed" },
      bands: [
        { atMost: 0, points: 80 },
        { points: 200 },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.15, points: 150 },
        { atMost: 0.3, points: 110 },
        { atMost: 0.5, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.5, points: 85 },
        { atMost: 1.5, points: 60 },
        { atMost: 3, points: 30 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        // Chasing an inferior remediation (scaling IOPS, or throttling
        // compaction) instead of fixing the multiplier is explicitly
        // penalized here, independent of dataIntegrity's own lower band
        // for an incomplete diagnosisPath — operationalEfficiency
        // measures the COST of the wrong actions taken, dataIntegrity
        // measures whether the right diagnosis was ultimately reached.
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
