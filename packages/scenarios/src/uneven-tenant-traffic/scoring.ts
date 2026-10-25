import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Uneven Tenant Traffic's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept, but it does have a real,
 * candidate-visible "genuinely fair vs. merely scaled" distinction
 * (tenantFairnessMode, set by rules.ts): the optimal/acceptable paths
 * actually restore every other tenant's fair share of shared capacity,
 * while the scaled-only trap (and every still-unresolved path) never
 * does, even when the fleet itself looks healthy. That distinction is
 * honestly integrity-adjacent — "is the platform's fairness guarantee
 * actually intact, or only its capacity symptom suppressed" — so
 * dataIntegrity bands on it generically via finalStringEquals (same
 * pattern as Missing Database Index's orderHistoryQueryHealth and Hot
 * Database Partition's partitionRebalanceMode), never a scenario-
 * specific scorer. costEfficiency separately and naturally discriminates
 * the isolation tradeoff (real infrastructure spend) from the
 * zero-marginal-cost throttle tradeoffs via the existing
 * costIncreaseRatio measure — no new measure needed for that.
 */
export const UNEVEN_TENANT_TRAFFIC_SCORING: AuthoredScoringConfig = {
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
      // Generic string-state measure (packages/scenarios/src/authoring/
      // score.ts) comparing tenantFairnessMode against
      // "fair-share-restored". measureDimension returns 0 when it
      // matches (genuine fairness restored — either throttle-based
      // optimal path or the isolation/lane acceptable paths) and 1
      // otherwise (scaled-only trap, or any still-unresolved/partial
      // path) — so the `atMost: 0` band awards full marks only to a
      // genuine fairness fix, and every other state falls through to the
      // lower fallback band. No scenario-specific scorer code — the same
      // closed measure type Missing Database Index already uses for
      // orderHistoryQueryHealth.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringNotEquals", field: "tenantFairnessMode", value: "fair-share-restored" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 40 },
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
