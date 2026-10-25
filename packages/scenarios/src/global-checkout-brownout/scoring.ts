import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Global Checkout Brownout's scoring configuration.
 *
 * dataIntegrity starts at 200 and applies two independent, additively-
 * stacking penalties, each keyed off a DIFFERENT generic string-state
 * value checkoutMitigationMode can hold (rules.ts):
 *   - equals "critical-path-partially-trimmed" (the ACCEPTABLE, smaller
 *     mitigation) costs 60 points -- this is the ONLY state this penalty
 *     matches, since it is a `finalStringEquals` check, not a negation.
 *   - equals "unresolved" OR "retry-amplified" (i.e. neither trim variant
 *     ever engaged) costs 150 points via two separate `finalStringEquals`
 *     penalties on the same measure-family (only the single matching one
 *     applies, since they are mutually exclusive string values).
 * The full structural fix sets checkoutMitigationMode to
 * "critical-path-trimmed" specifically, which matches NEITHER penalty,
 * so it keeps all 200. The partial-trim ACCEPTABLE state sets
 * "critical-path-partially-trimmed", matching only the first penalty, so
 * it lands at 140 -- genuinely, measurably below the full fix's 200,
 * never equal to or above it, for a real, authored reason (a smaller
 * mitigation, not a correctness gap). Baseline/harmful-retry/the
 * optimistic-reservation trap (none of which ever set checkoutMitigationMode
 * to either trim value) match the second penalty and land at 50 --
 * including the trap, regardless of how fast Inventory's own latency
 * reads, since latency is never part of this measure at all -- this is
 * the dimension that keeps the availability-good/correctness-bad
 * optimistic-reservation trap from scoring anywhere near optimal, even
 * though its own low revenue-loss rate (Inventory itself is fast) would
 * otherwise earn it a high customerImpact band.
 */
export const GLOBAL_CHECKOUT_BROWNOUT_SCORING: AuthoredScoringConfig = {
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
        { atMost: 500, points: 200 },
        { atMost: 2_000, points: 160 },
        { atMost: 5_000, points: 110 },
        { atMost: 10_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "checkoutMitigationMode", value: "critical-path-partially-trimmed" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "checkoutMitigationMode", value: "unresolved" },
          atLeast: 1,
          subtractPoints: 150,
        },
        {
          measure: { type: "finalStringEquals", field: "checkoutMitigationMode", value: "retry-amplified" },
          atLeast: 1,
          subtractPoints: 150,
        },
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
        { atMost: 0.2, points: 80 },
        { atMost: 0.5, points: 55 },
        { atMost: 1, points: 25 },
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
