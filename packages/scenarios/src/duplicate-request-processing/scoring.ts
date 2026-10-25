import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Duplicate Request Processing's scoring configuration. This scenario's
 * central correctness concept is duplicateSideEffectStatus (set by
 * rules.ts): "deduplicated" means idempotency-key checking is genuinely
 * enforced AND backed by atomic transaction handling, so duplicate side
 * effects hold at zero; "duplicating" covers every other reachable
 * state, including the partial "enforced-without-atomic" path where a
 * race window still lets some duplicates through. dataIntegrity bands on
 * this generically via finalStringEquals (same pattern as Missing
 * Database Index's orderHistoryQueryHealth / Kafka Partition Skew's
 * orderingMode) rather than relying only on recovery/reliability, which
 * can be driven primarily by latency and would not by themselves
 * discriminate "fast but still duplicating" from "fast and genuinely
 * safe." No scenario-specific scorer code — only the generic string-state
 * measure every built-in scenario with a correctness tradeoff already
 * uses.
 */
export const DUPLICATE_REQUEST_PROCESSING_SCORING: AuthoredScoringConfig = {
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
      // Generic string-state measure comparing duplicateSideEffectStatus
      // against "deduplicated". measureDimension returns 1 when it
      // matches (the real fix is genuinely in effect) and 0 otherwise
      // (every still-duplicating or unresolved state), so the `atMost: 0`
      // band (measured 0, i.e. NOT deduplicated) scores the correctness
      // failure, and only the genuinely-deduplicated path falls through
      // to the higher fallback band.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringNotEquals", field: "duplicateSideEffectStatus", value: "deduplicated" },
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
