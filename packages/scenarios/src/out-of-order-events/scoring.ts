import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Out-of-Order Events' scoring configuration. The central correctness
 * concept is orderingIntegrityMode (set by rules.ts), a generic
 * string-state field with four values:
 *
 *   "ordering-preserved" — physical cause removed, violations are zero
 *   "reordering-risk"    — violations occur but are PROVEN to reconcile
 *                          within the authored-safe bounded window
 *   "unsafe-divergence"  — violations occur and are NOT reliably
 *                          reconciled; unreconciledViolationCount grows
 *   "unresolved"         — incident active, no stabilizing mitigation
 *
 * dataIntegrity bands directly on this via finalStringEquals (same
 * generic-measure pattern as Kafka Partition Skew's orderingMode and
 * Missing Database Index's orderHistoryQueryHealth) so a
 * "healthy-looking-but-corrupt" round-robin configuration — throughput
 * and consumer lag both green, but unreconciledViolationCount silently
 * growing — scores LOW on data integrity even though it would otherwise
 * look fully recovered. No scenario-specific scorer code.
 */
export const OUT_OF_ORDER_EVENTS_SCORING: AuthoredScoringConfig = {
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
      // Stacked generic string-state penalties, so three distinct
      // outcomes are representable (bands' single-measure model can only
      // express two tiers off one boolean-valued measure): start at full
      // marks; subtract 60 for anything short of the fully
      // "ordering-preserved" optimal (first penalty, fires for every
      // other value); subtract a further 80 specifically when the state
      // is actively "unsafe-divergence" or still "unresolved" rather
      // than the proven-bounded "reordering-risk" acceptable tier
      // (second and third penalties, each gated on one exact bad value
      // via finalStringEquals so they never fire for reordering-risk).
      // Net result: ordering-preserved -> 200, reordering-risk -> 140
      // (real residual risk, substantial but not full marks),
      // unsafe-divergence/unresolved -> 60 (low — exactly the
      // "healthy-looking-but-corrupt" case this dimension exists to
      // catch, even when recovery/customerImpact might otherwise look
      // identical to the acceptable path).
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "orderingIntegrityMode", value: "ordering-preserved" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "orderingIntegrityMode", value: "unsafe-divergence" },
          atLeast: 1,
          subtractPoints: 80,
        },
        {
          measure: { type: "finalStringEquals", field: "orderingIntegrityMode", value: "unresolved" },
          atLeast: 1,
          subtractPoints: 80,
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
