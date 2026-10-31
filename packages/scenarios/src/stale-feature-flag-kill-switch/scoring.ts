import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Stale Feature-Flag Kill Switch's own scoring configuration. Every
 * dimension uses the same generic, data-driven scorer every other
 * scenario uses (packages/scenarios/src/authoring/score.ts) — zero new
 * scoring logic was added for this scenario, per the binding "zero slug
 * branching" scoring architecture decision (phase6_scoring_architecture).
 *
 * Every dimension's maxPoints is the fixed catalog-wide value every
 * scenario uses: recovery=300, customerImpact=200, dataIntegrity=200,
 * reliability=150, costEfficiency=100, operationalEfficiency=50.
 *
 * Investigation quality is scored explicitly via the existing
 * `finalStringEquals` measure against the `diagnosisPath` state value
 * rules.ts authors directly — never inferred from roleInIncident tags,
 * which are reserved for the post-incident narrative only.
 */
export const STALE_FEATURE_FLAG_KILL_SWITCH_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 230 },
        { atMost: 240, points: 160 },
        { atMost: 360, points: 90 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 3_000, points: 200 },
        { atMost: 8_000, points: 150 },
        { atMost: 16_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored investigation-quality scoring — whether the
      // candidate investigated the flag audit log and the legacy
      // engine's logs before applying the fix ("investigated-then-
      // fixed"), applied the correct fix without demonstrating that
      // investigation ("guessed-fix"), chased one of the two inferior
      // single-action remediations, or did nothing at all. Every value
      // is a literal rules.ts authors by hand.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "diagnosisPath", value: "investigated-then-fixed" },
      bands: [
        { atMost: 0, points: 70 },
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
        // Chasing an inferior single-action remediation (restarting the
        // service, or merely reverting the trigger flag) instead of
        // disabling the stale kill switch is explicitly penalized here,
        // in addition to dataIntegrity's own lower band for an
        // incomplete diagnosisPath — operationalEfficiency measures the
        // COST of the wrong actions taken, dataIntegrity measures
        // whether the right diagnosis was ultimately reached.
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 4, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 10 },
      ],
    },
  ],
};
