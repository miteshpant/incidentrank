import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Deployment Regression's own scoring configuration — no
 * provider-recovery semantics, reliability weighted on time spent in a
 * critical regression state generically (criticalTimeRatio). See
 * docs/implementation_plan/phase6.md's scoring-convergence mandate.
 */
export const DEPLOYMENT_REGRESSION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 45, points: 300 },
        { atMost: 90, points: 250 },
        { atMost: 150, points: 200 },
        { atMost: 240, points: 140 },
        { atMost: 420, points: 80 },
        { points: 30 },
      ],
    },
    {
      // Bands tightened to this scenario's actual revenue-loss scale
      // (a sustained-60s failure window means even the harmful path's
      // accrual stays under $5,000) — regression test for a bug where
      // the harmful trap (debug logging left on, full traffic still on
      // the regressed version) and the pure baseline/no-action path both
      // saturated the same top band and scored identically on
      // customerImpact despite measurably different revenueLossUsd.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 2_000, points: 200 },
        { atMost: 3_500, points: 160 },
        { atMost: 5_000, points: 120 },
        { atMost: 15_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // No duplicate/lost-write modeling yet — same documented limitation
      // as every other built-in scenario: award full marks via a single
      // catch-all band rather than fabricating a measure that doesn't
      // exist in the closed AuthoredScoringMeasure set.
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
        { atMost: 1.5, points: 65 },
        { atMost: 3, points: 35 },
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
