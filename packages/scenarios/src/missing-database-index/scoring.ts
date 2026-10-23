import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Missing Database Index's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept, but it does have a real,
 * candidate-visible "fixed vs. merely removed" distinction
 * (orderHistoryQueryHealth, set by rules.ts): the optimal path actually
 * repairs the query path, while the acceptable path only disables the
 * feature generating the load. That distinction is honestly
 * integrity-adjacent — "is the system's capability intact, or only its
 * symptoms suppressed" — so dataIntegrity bands on it generically via
 * finalStringEquals (same pattern as Kafka Partition Skew's
 * orderingMode), rather than tying optimal/acceptable at a flat
 * catch-all band. This is the Phase 6B section 17 remedy for a verified
 * suspicious tie: recovery/customerImpact/reliability legitimately tie
 * between the optimal and acceptable paths when both mitigations are
 * applied equally fast (see missing-database-index.test.ts's note) —
 * reliability's criticalTimeRatio floor is itself a pre-existing,
 * already-accepted engine-wide limitation (also present in Kafka
 * Partition Skew's own fastest-recovery path), not something this
 * scenario's scoring can or should fix. dataIntegrity is the dimension
 * that correctly discriminates optimal from acceptable instead.
 */
export const MISSING_DATABASE_INDEX_SCORING: AuthoredScoringConfig = {
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
      // score.ts) comparing orderHistoryQueryHealth against
      // "feature-disabled". measureDimension returns 1 when it matches
      // (the acceptable path: endpoint disabled, capability removed,
      // not fixed) and 0 otherwise (the optimal "indexed" path, and
      // every still-unresolved/harmful path alike, since neither of
      // those equals "feature-disabled" either) — so the `atMost: 0`
      // band (measured 0) awards full marks to "capability intact or
      // incident simply unresolved," and only the feature-disabled
      // acceptable path falls through to the lower fallback band. No
      // scenario-specific scorer code — the same closed measure type
      // Kafka Partition Skew already uses for orderingMode.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "orderHistoryQueryHealth", value: "feature-disabled" },
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
