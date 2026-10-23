import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cache Eviction Storm's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept, but it does have a real,
 * candidate-visible "fixed vs. merely scaled" distinction
 * (cacheRecoveryMode, set by rules.ts): the optimal path actually
 * changes the caching/admission policy to match the new object shape
 * and cardinality, while a memory-only response never reaches
 * cacheRecoveryMode === "policyFixed" at all (it never crosses the
 * successCondition bar — see revenue-and-cost.ts and definition.ts's
 * completion-mode audit). That distinction is honestly
 * integrity-adjacent — "is the cache's own caching capability actually
 * repaired, or only given more room to keep thrashing in" — so
 * dataIntegrity bands on it generically via finalStringEquals (same
 * pattern as Missing Database Index's orderHistoryQueryHealth / Kafka
 * Partition Skew's orderingMode), rather than leaving that distinction
 * to recovery/reliability alone.
 */
export const CACHE_EVICTION_STORM_SCORING: AuthoredScoringConfig = {
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
        { atMost: 4_000, points: 200 },
        { atMost: 12_000, points: 160 },
        { atMost: 25_000, points: 110 },
        { atMost: 45_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure (packages/scenarios/src/authoring/
      // score.ts) comparing cacheRecoveryMode against "memoryScaled".
      // measureDimension returns 1 when it matches (a memory-only
      // response — real but genuinely incomplete, never reaching
      // resolved status at all) and 0 otherwise (the policyFixed path,
      // and every still-unresolved/harmful path alike, since neither of
      // those equals "memoryScaled" either). Because a memory-only
      // attempt never resolves, it is scored via the unresolved terminal
      // override on this dimension (0) rather than ever reaching the
      // atMost:0 band below — the band structure is retained for
      // defensiveness and symmetry with the scenario's sibling
      // string-state-scored scenarios, not because a resolved
      // memory-scaled attempt is reachable.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "cacheRecoveryMode", value: "memoryScaled" },
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0, points: 200 },
        { points: 120 },
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
