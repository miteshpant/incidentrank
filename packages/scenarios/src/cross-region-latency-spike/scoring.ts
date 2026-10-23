import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cross-Region Latency Spike's scoring configuration.
 *
 * The real correctness signal this scenario models is
 * paymentAuthConsistency (rules.ts/metrics.ts) — whether payment
 * authorization, the one operation the business requires to stay
 * strongly consistent, actually still is. That field alone cannot be
 * banded by the generic scorer's fixed numeric measures, so, following
 * Missing Database Index's orderHistoryQueryHealth and Distributed Lock
 * Failure's lockSafetyMechanism precedent, dataIntegrity bands on it
 * generically via finalStringNotEquals("strong")
 * (packages/scenarios/src/authoring/score.ts) — "strong" (every safe
 * state: the optimal fast-relaxation path, the acceptable patient path,
 * and even an unresolved/harmful-but-not-payment-touching attempt)
 * scores full marks, and "relaxed-unsafe" (the one genuinely unsafe
 * move) scores the lower band. No scenario-specific scorer code.
 *
 * recovery/customerImpact/reliability legitimately TIE between the
 * OPTIMAL (fast, general traffic relaxed) and ACCEPTABLE (patient,
 * fully synchronous) paths when both are applied/declared on a similar
 * timescale — the same pre-existing, already-accepted
 * recoveryTimeSeconds/criticalTimeRatio tiny-denominator artifact
 * Missing Database Index's scoring.ts documents (section 17's
 * "suspicious tie" investigation), not something this scenario's
 * scoring redesigns. dataIntegrity also ties between them (both are
 * genuinely safe). The dimension that correctly, honestly
 * discriminates the two here is costEfficiency: running asynchronous
 * cross-region replication for the relaxed general-data path
 * (revenue-and-cost.ts's infrastructureCost) carries a real, ongoing
 * cost the fully-synchronous patient path never pays. This means the
 * "optimal" (latency-fastest, correctness-maximal) tier can legitimately
 * score at or slightly below the "acceptable" (patient) tier's total —
 * by design, per phase6b.md section 40: these are two different,
 * equally scoreable strategies with different dimension tradeoffs, not
 * a strictly-ordered better/worse pair.
 */
export const CROSS_REGION_LATENCY_SPIKE_SCORING: AuthoredScoringConfig = {
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
      // Generic string-state measure: 1 when paymentAuthConsistency !==
      // "strong" (the one genuinely unsafe move — relaxing the
      // correctness-critical operation), 0 otherwise. No
      // scenario-specific scorer code.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringNotEquals", field: "paymentAuthConsistency", value: "strong" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 20 },
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
