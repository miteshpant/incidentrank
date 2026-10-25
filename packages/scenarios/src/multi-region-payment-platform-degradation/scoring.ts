import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Multi-Region Payment Platform Degradation's scoring configuration.
 *
 * This scenario has two independent correctness invariants (divergent
 * ledger authority, mandatory fraud-control bypass). Rather than
 * picking one as "dominant" (which would let a fraud-control bypass
 * score full dataIntegrity marks merely because ledger authority
 * happened to be routed correctly), rules.ts authors a single unified
 * `correctnessStatus` field ("safe" | "violated") that is "violated" if
 * EITHER invariant is broken. dataIntegrity bands on THAT field via
 * finalStringEquals("safe") -- every correctness-violating path
 * (divergent authority, fraud bypass, or both) lands in the lowest
 * band, and no single violation can hide behind the other invariant's
 * safety.
 */
export const MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 120, points: 300 },
        { atMost: 200, points: 250 },
        { atMost: 280, points: 190 },
        { atMost: 400, points: 120 },
        { atMost: 600, points: 60 },
        { points: 15 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 3_500, points: 200 },
        { atMost: 10_000, points: 160 },
        { atMost: 25_000, points: 100 },
        { atMost: 60_000, points: 50 },
        { points: 10 },
      ],
    },
    {
      // Correctness measure: full marks only when NEITHER business
      // invariant has been violated (see correctnessStatus's doc
      // comment in metrics.ts). The divergent-authority trap, the
      // fraud-bypass path (even though it never touches ledger
      // routing), and the untouched baseline all land in the lowest
      // band -- availability numbers are never part of this measure.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "correctnessStatus", value: "safe" },
      bands: [
        { atMost: 0, points: 40 },
        { points: 200 },
      ],
    },
    {
      // Reliability measures whether US ledger/settlement capacity is
      // FULLY drained (capacityRiskStatus === "normal") at the moment
      // of Finish/scoring, not merely "not critical." This is the
      // dimension that discriminates the acceptable tier (still
      // draining -- capacityRiskStatus === "warning", real backlog/lag
      // remaining) from the optimal tier (fully recovered after the
      // real elapsed catch-up window) -- criticalTimeRatio alone cannot
      // do this, since neither tier ever reaches "critical". This is
      // deliberate: the acceptable tier must score strictly lower on
      // reliability than optimal even though it may Finish sooner (a
      // faster but incomplete recovery is not automatically superior to
      // a slower, fully-drained one).
      dimension: "reliability",
      maxPoints: 150,
      measure: { type: "finalStringEquals", field: "capacityRiskStatus", value: "normal" },
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0, points: 50 },
        { points: 150 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.3, points: 80 },
        { atMost: 0.6, points: 55 },
        { atMost: 1, points: 30 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 7, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 10, subtractPoints: 10 },
      ],
    },
  ],
};
