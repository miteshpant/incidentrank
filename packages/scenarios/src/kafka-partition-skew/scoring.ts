import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Kafka Partition Skew's own scoring configuration. This scenario's
 * central trap — scaling consumer instances while the hot key stays
 * unsalted — is deliberately penalized on BOTH costEfficiency and
 * operationalEfficiency simultaneously (wasted spend AND a harmful
 * classified action), reinforcing that the "obvious" fix from Kafka
 * Consumer Lag does not generalize here. See docs/implementation_plan/
 * phase6.md's scoring-convergence mandate.
 */
export const KAFKA_PARTITION_SKEW_SCORING: AuthoredScoringConfig = {
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
      // Phase 6.1: the round-robin tradeoff's ordering risk is now a
      // real, candidate-visible state field (orderingMode, set by
      // rules.ts) rather than narrative-only — "the system now accepts
      // out-of-order delivery for a hot tenant's messages" is honestly a
      // data-integrity-adjacent tradeoff, not a hard violation, so it's
      // penalized rather than zeroed. Uses the generic
      // finalStringEquals measure (packages/scenarios/src/authoring/
      // score.ts) — no Kafka-specific code in the shared scorer.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "orderingMode", value: "degraded" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 140 },
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
        { atMost: 0.5, points: 85 },
        { atMost: 1.5, points: 60 },
        { atMost: 3, points: 25 },
        { points: 5 },
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
