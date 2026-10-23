import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Fan-Out Request Explosion's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept, but it does have a real,
 * candidate-visible "core dependency intact vs. put at risk" distinction
 * (corePathHealth, set by rules.ts): every genuinely recovered state
 * (enrichment excluded, partial-response tolerance, or batching+cache)
 * keeps corePathHealth at "core-path-intact", while the batching-alone
 * and raised-concurrency paths visibly push a CORE dependency (Service A)
 * toward or into saturation despite "fixing" the optional one. That
 * distinction is honestly integrity-adjacent — "is the core capability
 * actually safe, or only the optional symptom suppressed while a core
 * dependency absorbs new risk" — so dataIntegrity bands on it generically
 * via finalStringEquals (same pattern as Missing Database Index's
 * orderHistoryQueryHealth and Kafka Partition Skew's orderingMode),
 * rather than inventing a scenario-specific scorer.
 */
export const FAN_OUT_REQUEST_EXPLOSION_SCORING: AuthoredScoringConfig = {
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
        { atMost: 5_000, points: 200 },
        { atMost: 15_000, points: 160 },
        { atMost: 30_000, points: 110 },
        { atMost: 55_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure comparing corePathHealth against
      // "core-path-at-risk". measureDimension returns 1 when it
      // matches (a core dependency has been put at risk — batching
      // alone, or raised concurrency) and 0 otherwise (every genuinely
      // recovered state, and the still-unresolved baseline alike, since
      // neither equals "core-path-at-risk" either) — so the `atMost: 0`
      // band awards full marks to "core dependencies never put at
      // risk," and only a state that visibly pressured Service A falls
      // through to the lower fallback band. No scenario-specific
      // scorer code.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "corePathHealth", value: "core-path-at-risk" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 60 },
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
