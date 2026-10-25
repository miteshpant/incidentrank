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
 * recovery/reliability/dataIntegrity legitimately TIE between the
 * OPTIMAL (fast, general traffic relaxed) and ACCEPTABLE (patient,
 * fully synchronous) paths — recovery/reliability score off
 * deriveScoringResolvedAtMs's sustain-window-anchored timestamp (not
 * wall-clock Finish time), and both paths are genuinely safe, so
 * dataIntegrity ties too. costEfficiency correctly discriminates in the
 * OPTIMAL path's favor being worse (running asynchronous cross-region
 * replication for the relaxed general-data path carries a real, ongoing
 * cost — infrastructureCost in revenue-and-cost.ts), but that dimension
 * alone (100 points, coarse bands) used to be too small to overcome the
 * tie everywhere else.
 *
 * Phase 6B.1 fix: customerImpact now carries the decisive, genuine
 * separation. Raising acceptableCondition.sustainedSeconds to 45
 * (revenue-and-cost.ts) means the patient path accrues real tracked
 * revenueLossUsd for the full 45-second observation window before
 * Finish is even eligible (~$323 at this scenario's authored
 * "fully-synchronous-degraded" loss rate), while the fast path's own
 * successCondition (sustainedSeconds: 15, unchanged) resolves against a
 * much lower loss rate (~$20). The customerImpact bands below were
 * tightened to this scenario's own actual dollar scale (its revenue-loss
 * rates and incident duration can never approach the generic 6,000+
 * bands used elsewhere in the catalog) so this real, already-modeled
 * cost difference actually crosses a band boundary instead of both
 * paths tying at the top band regardless of how long the candidate
 * waited. Net result: OPTIMAL (980) now legitimately outscores
 * ACCEPTABLE (970) — per phase6b.1.md section 8's "prefer optimal >
 * acceptable" — while ACCEPTABLE still earns a strong score and both
 * remain clearly, correctly ahead of every harmful/unsafe path.
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
      // Phase 6B.1 fix: bands tightened to this scenario's own actual
      // dollar scale. This scenario's revenue-loss rates (25-700/min,
      // revenue-and-cost.ts) over a 15-50 second window can never exceed
      // a few hundred dollars — the generic 6,000+ bands used elsewhere
      // in the catalog (sized for longer, costlier incidents) would tie
      // every realistic path here at the top band regardless of how long
      // the candidate took, hiding the real cost of the patient
      // strategy's required 45s observation window (~$323) against the
      // fast strategy's ~$20. This is the genuine, already-modeled
      // tradeoff the fix in revenue-and-cost.ts's acceptableCondition
      // change actually produces — not an arbitrary penalty layered on
      // top of it.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 50, points: 200 },
        { atMost: 500, points: 170 },
        { atMost: 2_000, points: 120 },
        { atMost: 6_000, points: 70 },
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
