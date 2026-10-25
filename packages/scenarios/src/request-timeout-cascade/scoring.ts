import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Request Timeout Cascade's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept, but it does have a real,
 * candidate-visible "fixed vs. merely fenced-off" distinction
 * (timeoutBudgetHealth, set by rules.ts): the optimal path actually
 * re-proportions the timeout budget end-to-end AND enables cancellation,
 * while the acceptable path only trips the circuit breaker and stops
 * calling the degraded Dependency altogether. That distinction is
 * honestly integrity-adjacent — "is the system's full capability intact,
 * or only its symptoms suppressed" — so dataIntegrity bands on it
 * generically via finalStringEquals (same pattern as Kafka Partition
 * Skew's orderingMode, Missing Database Index's orderHistoryQueryHealth,
 * and Dependency Timeout Cascade's timeoutBudgetHealth), rather than
 * tying optimal/acceptable at a flat catch-all band. No scenario-specific
 * scorer code.
 */
export const REQUEST_TIMEOUT_CASCADE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 75, points: 300 },
        { atMost: 135, points: 250 },
        { atMost: 195, points: 190 },
        { atMost: 315, points: 130 },
        { atMost: 495, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 9_000, points: 200 },
        { atMost: 24_000, points: 160 },
        { atMost: 48_000, points: 110 },
        { atMost: 80_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure (packages/scenarios/src/authoring/
      // score.ts) comparing timeoutBudgetHealth against "fenced".
      // measureDimension returns 1 when it matches (the acceptable path:
      // breaker tripped, Dependency fenced off, budget not actually
      // re-proportioned) and 0 otherwise (the optimal "rebudgeted" path,
      // and every still-unresolved/harmful path alike, since neither of
      // those equals "fenced" either) — so the `atMost: 0` band
      // (measured 0) awards full marks to "budget genuinely fixed or
      // incident simply unresolved," and only the breaker-tripped
      // acceptable path falls through to the lower fallback band.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "timeoutBudgetHealth", value: "fenced" },
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
