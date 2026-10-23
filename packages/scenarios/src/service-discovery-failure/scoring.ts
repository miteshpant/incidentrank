import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Service Discovery Failure's own scoring configuration. No duplicate/
 * lost-write modeling applies here (this is an availability/routing
 * incident, not a correctness one) — dataIntegrity is awarded via a
 * single catch-all band, the same documented limitation every other
 * non-correctness built-in scenario uses. costEfficiency bands on
 * costIncreaseRatio since the only real cost lever (retryCount) is also
 * the harmful trap — raising it both costs more AND makes the incident
 * worse, reinforcing (rather than contradicting) operationalEfficiency's
 * harmful-change penalty.
 */
export const SERVICE_DISCOVERY_FAILURE_SCORING: AuthoredScoringConfig = {
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
      // Bands intentionally tighter than poison-message-loop's: this
      // scenario's revenue-loss rates (260-900 USD/min, revenue-and-
      // cost.ts) are much smaller in magnitude, so a poison-message-
      // loop-scale $5k top band would never discriminate within a
      // realistic attempt duration — verified via the scoring-fidelity
      // audit below (harmful's higher revenueLossUsd must score worse
      // than baseline's lower one, not tie at the same top band).
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 400, points: 200 },
        { atMost: 800, points: 160 },
        { atMost: 1_500, points: 110 },
        { atMost: 3_000, points: 60 },
        { points: 10 },
      ],
    },
    {
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
