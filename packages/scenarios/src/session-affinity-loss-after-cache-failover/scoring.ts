import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Session Affinity Loss After Cache Node Failover's scoring
 * configuration. Every dimension uses the same generic, data-driven
 * scorer every other scenario uses (packages/scenarios/src/authoring/
 * score.ts) — zero new scoring logic was added for this scenario, per
 * the binding "zero slug branching" scoring architecture decision.
 *
 * maxPoints per dimension is the fixed catalog-wide split every
 * scenario uses: recovery=300, customerImpact=200, dataIntegrity=200,
 * reliability=150, costEfficiency=100, operationalEfficiency=50 (sums
 * to 1000) — see validateAuthoredScenario's SCORE_MAX_BY_DIMENSION.
 *
 * Investigation quality/prioritization is scored explicitly via the
 * existing `finalStringEquals` measure against the `diagnosisPath`
 * state value rules.ts authors directly — never inferred from
 * roleInIncident tags, which are reserved for the post-incident
 * narrative only.
 */
export const SESSION_AFFINITY_LOSS_AFTER_CACHE_FAILOVER_SCORING: AuthoredScoringConfig = {
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
        { atMost: 6_000, points: 200 },
        { atMost: 15_000, points: 150 },
        { atMost: 30_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored investigation-quality scoring — whether the
      // candidate correlated session routing, auth logs, and cache node
      // metrics before applying both halves of the fix
      // ("correlated-then-fixed"), applied the correct fix without
      // demonstrating that correlation ("guessed-fix"), applied only
      // half the fix ("reseeded-without-resync"), chased one of the two
      // inferior remediations, or did nothing at all. Every value is a
      // literal rules.ts authors by hand — not derived from
      // roleInIncident, not computed by any generic heuristic.
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
        // Chasing an inferior remediation (scaling the cache cluster, or
        // restarting the app server pool) instead of the real fix is
        // explicitly penalized here, in addition to dataIntegrity's own
        // lower band for an incomplete diagnosisPath —
        // operationalEfficiency measures the COST of the wrong actions
        // taken, dataIntegrity measures whether the right diagnosis was
        // ultimately reached.
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
