import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Partial Regional Dependency Failure's scoring configuration. This
 * scenario has no data-loss/duplication/ordering concept, but it does
 * have a real, candidate-visible "region-scoped vs. uniform global"
 * distinction (mitigationApproach, set by rules.ts): the optimal path
 * isolates only the regions that are actually unhealthy, while the
 * acceptable path reaches a similarly safe-looking blended state by
 * uniformly sacrificing the one healthy region too. dataIntegrity bands
 * on that distinction generically via finalStringEquals (same pattern as
 * Missing Database Index's orderHistoryQueryHealth / Kafka Partition
 * Skew's orderingMode) rather than relying on recovery/customerImpact
 * alone to separate the two paths — recoveryTimeSeconds and
 * revenueLossUsd can legitimately be close between them when both
 * mitigations are applied at the same elapsed time, so dataIntegrity is
 * the dimension that reliably discriminates "treated every region on
 * its own merits" from "treated every region the same."
 */
export const PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING: AuthoredScoringConfig = {
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
        { atMost: 3_000, points: 200 },
        { atMost: 9_000, points: 160 },
        { atMost: 20_000, points: 110 },
        { atMost: 40_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure (packages/scenarios/src/authoring/
      // score.ts) comparing mitigationApproach against "global".
      // measureDimension returns 1 when it matches (the acceptable
      // path: every region treated the same, including the healthy
      // one) and 0 otherwise (the optimal "regional" path, and every
      // still-unresolved/harmful path alike) — so the `atMost: 0` band
      // (measured 0) awards full marks to "treated regions on their
      // own merits, or incident simply unresolved," and only the
      // uniform-global acceptable path falls through to the lower
      // fallback band. No scenario-specific scorer code.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "mitigationApproach", value: "global" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 150 },
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
