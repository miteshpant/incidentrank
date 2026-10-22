import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Kafka Consumer Lag's own scoring configuration — no provider-recovery
 * semantics (this scenario has no external-provider timeline), reliability
 * weighted on time spent in a critical lag/rebalancing state generically
 * (criticalTimeRatio), matching this incident's own shape rather than
 * Payment Retry Storm's or Database Connection Saturation's tuning. See
 * docs/implementation_plan/phase6.md's scoring-convergence mandate.
 */
export const KAFKA_CONSUMER_LAG_SCORING: AuthoredScoringConfig = {
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
        { atMost: 5_000, points: 200 },
        { atMost: 15_000, points: 160 },
        { atMost: 30_000, points: 110 },
        { atMost: 50_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // The engine tracks deadLetterCount as a numeric watch field (see
      // definition.ts) and it already drives the customerImpact-adjacent
      // revenue-loss/cost signals above via the matched rule's state —
      // but the generic scoring measure vocabulary has no per-field
      // numeric-watch accessor yet, so (same documented limitation as
      // Payment Retry Storm v1 and Database Connection Saturation) this
      // dimension awards full marks via a single catch-all band rather
      // than fabricating a measure that doesn't exist.
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
