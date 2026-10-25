import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cache Invalidation Across Regions's scoring configuration.
 *
 * dataIntegrity (here read as "freshness/origin-safety integrity" —
 * the dimension doing the real work per phase6d3.md section 16's
 * explicit instruction that unsafe availability-maximizing paths must
 * not score near optimal) uses `penalties` mode entirely against the
 * closed-enum string-state field invalidationSystemStatus (the single
 * authoritative correctness/safety summary this scenario authors) —
 * the generic scorer's literal "dataIntegrity" measure always returns
 * 0 (score.ts's measureDimension) and there is no numeric-threshold
 * penalty measure in the generic scorer, so penalizing the GLOBAL-
 * BYPASS unsafe path specifically (not merely "still degraded")
 * requires this string-state approach, exactly mirroring Ledger
 * Reconciliation Divergence and API Migration Dual-Write Failure's
 * established technique.
 *
 * Penalty stacking (score.ts's applyPenalties): within one measure,
 * only the tightest-matching threshold applies; since each listed
 * value is mutually exclusive on invalidationSystemStatus, at most one
 * ever matches here.
 */
export const CACHE_INVALIDATION_ACROSS_REGIONS_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band widths calibrated to this scenario's authored timeline:
      // the fastest genuine full recovery (fully-recovered /
      // fully-recovered-via-swr) requires waiting out the full
      // recovery window on top of the sustained-desync onset —
      // recoveryTimeSeconds in the 600-750s range is the BEST a
      // candidate can do, so it must land in the top band.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 260, points: 300 },
        { atMost: 450, points: 270 },
        { atMost: 700, points: 240 },
        { atMost: 950, points: 160 },
        { atMost: 1_300, points: 90 },
        { points: 25 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 250, points: 200 },
        { atMost: 600, points: 160 },
        { atMost: 1_200, points: 110 },
        { atMost: 2_200, points: 60 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment: penalties mode on invalidationSystemStatus.
      // "fully-recovered" / "bounded-acceptable" keep full credit (the
      // acceptable tier's own real-but-modest deduction lives in its
      // own smaller penalty below, not here). "multi-region-degraded"
      // and "targeted-partial" lose real credit for correctness/
      // freshness exposure still outstanding. "global-bypass-overload"
      // loses the most credit by far — per phase6d3.md section 16's
      // binding "availability-good/correctness-bad path is strongly
      // penalized," an available-looking system that achieved that by
      // overloading shared Origin capacity is this scenario's worst
      // outcome, even though its surface freshness metrics look
      // perfect.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "invalidationSystemStatus", value: "bounded-acceptable" },
          atLeast: 1,
          subtractPoints: 30,
        },
        {
          measure: { type: "finalStringEquals", field: "invalidationSystemStatus", value: "targeted-partial" },
          atLeast: 1,
          subtractPoints: 70,
        },
        {
          measure: { type: "finalStringEquals", field: "invalidationSystemStatus", value: "multi-region-degraded" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "invalidationSystemStatus", value: "global-bypass-overload" },
          atLeast: 1,
          subtractPoints: 180,
        },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.1, points: 150 },
        { atMost: 0.25, points: 115 },
        { atMost: 0.45, points: 80 },
        { atMost: 0.65, points: 45 },
        { points: 15 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.25, points: 80 },
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
        { measure: "configurationChangeCount", atLeast: 8, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 12, subtractPoints: 10 },
      ],
    },
  ],
};
