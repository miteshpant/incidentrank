import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Multi-AZ Storage Failure During Live Migration's own scoring
 * configuration. Every dimension uses the same generic, data-driven
 * scorer every other scenario uses (packages/scenarios/src/authoring/
 * score.ts) — zero new scoring logic was added for this scenario, per
 * the binding "zero slug branching" scoring architecture decision.
 *
 * maxPoints per dimension is the fixed catalog-wide split every built-in
 * and org-authored scenario uses (recovery=300, customerImpact=200,
 * dataIntegrity=200, reliability=150, costEfficiency=100,
 * operationalEfficiency=50 — see validateAuthoredScenario's
 * SCORE_MAX_BY_DIMENSION, packages/scenarios/src/authoring/validate.ts).
 *
 * Investigation quality/prioritization is scored explicitly via the
 * existing `finalStringEquals` measure against the `diagnosisPath` state
 * value rules.ts authors directly — never inferred from roleInIncident
 * tags, which are reserved for the post-incident narrative only. This is
 * the same mechanism the Checkout/Payment/Inventory Redis Contention
 * reference incident already uses; investigation-quality scoring is a
 * new DIMENSION here, not a new MEASURE in the shared scorer.
 */
export const MULTI_AZ_STORAGE_FAILURE_DURING_MIGRATION_SCORING: AuthoredScoringConfig = {
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
      // Explicit, authored investigation-quality scoring — whether the
      // candidate correlated AZ-A volume health + migration retry logs +
      // AZ-C saturation before applying the fix ("correlated-then-
      // fixed"), applied the correct two-part fix without demonstrating
      // that correlation ("guessed-fix"), partially relieved the cascade
      // ("paused-migration-only"), chased one of the two inferior
      // single-action remediations, or did nothing at all. Every value
      // is a literal rules.ts authors by hand — not derived from
      // roleInIncident, not computed by any generic "did they touch
      // root_cause" heuristic.
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
        // Chasing the harmful 100%-failover-without-pausing path, or
        // excessive configuration churn, is explicitly penalized here,
        // in addition to dataIntegrity's own lower band for an
        // incomplete diagnosisPath — operationalEfficiency measures the
        // COST of the wrong actions taken, dataIntegrity measures
        // whether the right diagnosis was ultimately reached.
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
