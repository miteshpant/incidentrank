import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Rate-Limit Failure's own scoring configuration — no provider-recovery
 * semantics (this scenario has no external-provider timeline),
 * reliability weighted on time spent in a critical throttled/escalating
 * state generically (criticalTimeRatio). See
 * docs/implementation_plan/phase6.md's scoring-convergence mandate.
 */
export const RATE_LIMIT_FAILURE_SCORING: AuthoredScoringConfig = {
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
      // Bands are tuned to this scenario's own revenue-loss scale, not
      // copied from Kafka Consumer Lag's — Rate-Limit Failure's revenue
      // loss accrues in the tens-to-low-thousands of USD (see
      // revenue-and-cost.ts's per-incidentState rates), not the tens of
      // thousands a provider-outage scenario produces. `failed` gets its
      // own terminal override: an attempt left to actively breach the
      // failure threshold is the worst customer outcome regardless of how
      // quickly it failed (a fast fail can otherwise look deceptively
      // "cheap" in raw revenueLossUsd purely because it ended sooner than
      // a longer-running but merely degraded partial-improvement path).
      // `unresolved` deliberately falls through to normal banding so the
      // two partial-improvement tiers (different violationRate, different
      // revenueLossUsd via distinct incidentState rates) score measurably
      // differently rather than collapsing to the same band.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      terminalOverrides: { failed: 20 },
      bands: [
        { atMost: 100, points: 200 },
        { atMost: 1_000, points: 150 },
        { atMost: 2_500, points: 100 },
        { atMost: 5_000, points: 50 },
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
