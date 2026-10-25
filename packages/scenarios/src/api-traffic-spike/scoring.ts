import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * API Traffic Spike's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept, but it does have a real,
 * candidate-visible "fixed vs. merely shed" distinction
 * (trafficSpikeHealth, set by rules.ts): the optimal paths actually
 * protect the database from the cache-miss flood (via DB protection, cache
 * behavior, or both), while the acceptable paths only reduce load reaching
 * the system (rate limiting legitimate traffic, disabling a feature, or
 * DB admission control alone with the cache still cold). That distinction
 * is honestly integrity-adjacent — "is the system's underlying capability
 * intact, or only its symptoms suppressed" — so dataIntegrity bands on it
 * generically via finalStringEquals (same pattern as Missing Database
 * Index's orderHistoryQueryHealth), rather than tying optimal/acceptable
 * at a flat catch-all band.
 */
export const API_TRAFFIC_SPIKE_SCORING: AuthoredScoringConfig = {
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
      // score.ts) comparing trafficSpikeHealth against "protected".
      // measureDimension returns 1 when NOT equal to "protected" — every
      // acceptable path (feature-disabled, rate-limited, DB-protection-
      // alone) and every still-unresolved/harmful path alike — and 0 when
      // it IS "protected" (either optimal path). The `atMost: 0` band
      // (measured 0) awards full marks to "the database was genuinely
      // protected or the incident is simply unresolved," and only a
      // reached-but-not-protected acceptable state falls through to the
      // lower fallback band. No scenario-specific scorer code — the same
      // closed measure type Missing Database Index already uses for
      // orderHistoryQueryHealth.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringNotEquals", field: "trafficSpikeHealth", value: "protected" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 160 },
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
