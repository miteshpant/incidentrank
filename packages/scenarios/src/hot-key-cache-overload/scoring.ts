import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Hot-Key Cache Overload's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept, but it does have a real,
 * candidate-visible "fixed the hot key specifically vs. spread load by
 * sacrificing locality" distinction (hotKeyMitigationMode, set by
 * rules.ts): the optimal paths (key replication, request coalescing, or
 * local API-tier caching) resolve the concentration for the hot key
 * specifically with no ongoing cost, while the acceptable path
 * (round-robin sharding) clears every symptom only by abandoning
 * per-key shard locality for every OTHER key in the cluster too. That
 * distinction is honestly integrity-adjacent — "was the fix targeted at
 * the actual cause, or did it clear the symptom by changing a guarantee
 * the rest of the system relies on" — so dataIntegrity bands on it
 * generically via finalStringEquals (same pattern as Missing Database
 * Index's orderHistoryQueryHealth and Hot Database Partition's
 * partitionRebalanceMode), rather than tying optimal/acceptable at a
 * flat catch-all band. No scenario-specific scorer code.
 */
export const HOT_KEY_CACHE_OVERLOAD_SCORING: AuthoredScoringConfig = {
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
      // score.ts) comparing hotKeyMitigationMode against
      // "locality-sacrificed". measureDimension returns 1 when it
      // matches (the round-robin acceptable path: symptom cleared by
      // sacrificing per-key shard locality cluster-wide) and 0
      // otherwise (every optimal targeted fix, and every still-
      // unresolved/harmful/origin-shielded path alike). The `atMost: 0`
      // band awards full marks to every path except the specific
      // locality-sacrifice tradeoff, which falls through to the lower
      // fallback band — a real, candidate-visible cost.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: {
        type: "finalStringEquals",
        field: "hotKeyMitigationMode",
        value: "locality-sacrificed",
      },
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
