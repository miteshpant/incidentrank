import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Partial Rollout Regression's scoring configuration. This scenario has
 * no acceptable tier (see definition.ts's completion-mode audit) — every
 * reachable state is either a genuine fix (regressionHealth ===
 * "regression-removed", via rollback, feature-flag disable, or
 * rollout-zeroed — all three score identically on dataIntegrity) or a
 * real, unresolved masking/harmful state. dataIntegrity bands on
 * regressionHealth generically via finalStringEquals (same pattern as
 * Missing Database Index's orderHistoryQueryHealth and Kafka Partition
 * Skew's orderingMode) so the scorer rewards the real "actually removed
 * vs. merely absorbed" distinction rather than only the surface-level
 * customer-facing metrics, which can look superficially similar under
 * masking.
 */
export const PARTIAL_ROLLOUT_REGRESSION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 250 },
        { atMost: 180, points: 190 },
        { atMost: 300, points: 130 },
        { atMost: 480, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 6_000, points: 200 },
        { atMost: 18_000, points: 160 },
        { atMost: 35_000, points: 110 },
        { atMost: 60_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // finalStringEquals(regressionHealth, "regression-removed") is 1
      // when the regression was genuinely removed (rollback, feature-flag
      // disable, or rollout-zeroed) and 0 for every masked/unresolved
      // state (including unresolved baseline/harmful paths). The `atMost:
      // 0` band therefore matches ONLY the real fixes.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringNotEquals", field: "regressionHealth", value: "regression-removed" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 90 },
      ],
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
        { atMost: 0.4, points: 80 },
        { atMost: 1, points: 55 },
        { atMost: 2, points: 25 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
