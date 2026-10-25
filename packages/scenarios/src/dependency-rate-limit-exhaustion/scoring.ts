import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Dependency Rate-Limit Exhaustion's scoring configuration. This
 * scenario has no data-loss/duplication/ordering concept, but it does
 * have a real, candidate-visible "durably fixed vs. merely suppressed"
 * distinction (quotaOutcome, set by rules.ts): the optimal paths
 * actually reduce the dependency's sustained call volume below the
 * quota's burn rate, while the acceptable path only turns off the
 * feature generating a share of that volume. That distinction is
 * honestly integrity-adjacent — "is the system's capability intact, or
 * only its symptoms suppressed" — so dataIntegrity bands on it
 * generically via finalStringEquals (same pattern as Missing Database
 * Index's orderHistoryQueryHealth and Kafka Partition Skew's
 * orderingMode), rather than tying optimal and acceptable at a flat
 * catch-all band.
 */
export const DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 250 },
        { atMost: 240, points: 190 },
        { atMost: 360, points: 130 },
        { atMost: 540, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 600, points: 200 },
        { atMost: 900, points: 160 },
        { atMost: 3_000, points: 110 },
        { atMost: 10_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure (packages/scenarios/src/authoring/
      // score.ts) comparing quotaOutcome against "feature-suppressed".
      // measureDimension returns 1 when it matches (the acceptable
      // path: feature off, capability removed, not fixed) and 0
      // otherwise (both optimal "sustained-under-quota" paths, and
      // every still-unresolved/harmful path alike) — so the `atMost: 0`
      // band awards full marks to "capability intact or incident simply
      // unresolved," and only the feature-suppressed acceptable path
      // falls through to the lower fallback band. No scenario-specific
      // scorer code.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "quotaOutcome", value: "feature-suppressed" },
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
