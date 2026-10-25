import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Global Feature Rollout Incident's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase6d.4.md section 17's binding sanity checks): a path that rolls
 * back without repairing must score materially worse than a path that
 * repairs (or engages the shim) even though BOTH show high
 * requestSuccessRate — the generic scorer's literal "dataIntegrity"
 * measure always returns 0 (see score.ts's measureDimension) and there
 * is no numeric-threshold penalty measure in the generic scorer, so this
 * dimension uses `penalties` mode against storeCompatibilityStatus (the
 * single authoritative correctness summary).
 *
 * The timeline's absolute fastest reachable OPTIMAL is via the
 * compatibility-shim path (global-rollback-with-compatibility-shim),
 * reachable the instant growth stops and the shim is engaged — no
 * elapsed repair-window wait required. The repair-based optimal path
 * (repair-fully-done-*) requires REPAIR_FULLY_DONE_MS - REGRESSION_ONSET_MS
 * = 540s minimum, even with every control set correctly within seconds,
 * since repair is a real, non-skippable elapsed-time mechanism. Recovery
 * bands are calibrated to comfortably include both, per Authorization
 * Policy Rollout Failure's identical calibration principle.
 */
export const GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 560, points: 260 },
        { atMost: 900, points: 190 },
        { atMost: 1_200, points: 120 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 250, points: 200 },
        { atMost: 650, points: 160 },
        { atMost: 1_300, points: 110 },
        { atMost: 2_500, points: 60 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment: penalties mode against the closed-enum
      // storeCompatibilityStatus string-state field. A fully compatible
      // path keeps the full 200 points. "contained" (rollback/halt
      // without repair, or dual-write without repairing the pre-existing
      // backlog) loses a real, substantial share — real but bounded
      // correctness gap. "diverging" (backlog still actively growing)
      // loses the vast majority — this is the required "rollback
      // without repair leaves a measurable correctness gap" and
      // "diverging/unmitigated must score far worse than contained"
      // guarantee.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "storeCompatibilityStatus", value: "contained" },
          atLeast: 1,
          subtractPoints: 95,
        },
        {
          measure: { type: "finalStringEquals", field: "storeCompatibilityStatus", value: "diverging" },
          atLeast: 1,
          subtractPoints: 175,
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
