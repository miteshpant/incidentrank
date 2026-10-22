import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cascading Service Failure's own scoring configuration — no
 * provider-recovery semantics (no external-provider timeline),
 * reliability weighted on time spent in a critical chain state
 * generically (criticalTimeRatio). operationalEfficiency penalizes
 * harmfulChangeCount more heavily than most other scenarios' defaults
 * since the central teaching point here is correct root-cause diagnosis
 * — wasting an action restarting healthy symptom services should cost
 * real points, not just a token deduction.
 */
export const CASCADING_SERVICE_FAILURE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 250 },
        { atMost: 180, points: 200 },
        { atMost: 300, points: 140 },
        { atMost: 480, points: 80 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 8_000, points: 200 },
        { atMost: 20_000, points: 160 },
        { atMost: 40_000, points: 110 },
        { atMost: 70_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // No duplicate/lost-transaction modeling yet — same documented
      // limitation as every other built-in scenario: award full marks
      // via a single catch-all band rather than fabricating a measure
      // that doesn't exist in the closed AuthoredScoringMeasure set.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: "dataIntegrity",
      bands: [{ points: 200 }],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.15, points: 150 },
        { atMost: 0.3, points: 115 },
        { atMost: 0.5, points: 80 },
        { atMost: 0.7, points: 45 },
        { points: 15 },
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
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 25 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 45 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
