import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * API Version Sunset Breaks Silent Long-Tail Consumers scoring
 * configuration. Every dimension uses the same generic, data-driven
 * scorer every other scenario uses (packages/scenarios/src/authoring/
 * score.ts) — zero new scoring logic added, per the binding "zero slug
 * branching" scoring architecture decision. maxPoints per dimension is
 * the fixed catalog-wide split (recovery=300, customerImpact=200,
 * dataIntegrity=200, reliability=150, costEfficiency=100,
 * operationalEfficiency=50 — see validateAuthoredScenario's
 * SCORE_MAX_BY_DIMENSION), summing to exactly 1000.
 *
 * Investigation quality is scored explicitly via the existing
 * `finalStringEquals` measure against the `investigationQuality` state
 * value rules.ts authors directly — exactly the mechanism the Checkout/
 * Payment/Inventory/Redis reference incident and Graceful Shutdown's
 * branching scenario already use. Both correct, fully-investigated
 * strategies ("investigated-extend-then-migrated" and "investigated-
 * shim-then-migrated") set `investigationQuality: "correlated"` and earn
 * identical full dataIntegrity credit here — this scenario's branching
 * lesson is about CHOOSING A STRATEGY deliberately (buy time vs.
 * mitigate fast, each with a different risk/cost profile), not about
 * one strategy being objectively superior to the other. The strategy
 * choice itself is captured by recovery/costEfficiency naturally
 * diverging between the two paths (the shim carries an ongoing
 * infrastructure cost the extended deadline does not), not by
 * dataIntegrity favoring one branch's choice.
 */
export const API_VERSION_SUNSET_BREAKS_SILENT_CONSUMERS_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 240 },
        { atMost: 240, points: 180 },
        { atMost: 360, points: 110 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 7_000, points: 200 },
        { atMost: 18_000, points: 150 },
        { atMost: 35_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored investigation-quality scoring — whether the
      // candidate correlated the consumer registry, gateway access logs,
      // and support ticket queue before committing to a strategy. Both
      // fully-investigated correct strategies earn identical full credit;
      // a guessed-but-correct strategy earns the lower band; the inferior
      // shim-only/extend-only/hard-cutover paths and doing nothing all
      // leave `investigationQuality` at its uncredited value.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "investigationQuality", value: "correlated" },
      bands: [
        { atMost: 0, points: 80 },
        { points: 200 },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.15, points: 150 },
        { atMost: 0.3, points: 110 },
        { atMost: 0.5, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.5, points: 85 },
        { atMost: 1.5, points: 60 },
        { atMost: 3, points: 30 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        // Forcing the harmful hard-cutover path is explicitly penalized
        // here, in addition to dataIntegrity's own lower band for an
        // incomplete investigationQuality — operationalEfficiency
        // measures the COST of the wrong actions taken, dataIntegrity
        // measures whether a correct diagnosis/strategy was ultimately
        // reached.
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
