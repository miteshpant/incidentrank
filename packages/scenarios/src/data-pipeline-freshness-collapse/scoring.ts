import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Data Pipeline Freshness Collapse's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase6d3.md section 16's score-sanity audit): a path with dropped
 * events or a Tier-1 SLO breach must score materially worse even if
 * recovery time / customer-impact metrics look excellent. As with
 * Ledger Reconciliation Divergence, the generic scorer's literal
 * "dataIntegrity" measure always returns 0 and there is no numeric-
 * threshold penalty measure (only the two string-state forms,
 * finalStringEquals/NotEquals), so this dimension uses `penalties` mode
 * against two closed-enum string-state fields authored specifically for
 * scoring: servingFreshnessStatus ("fresh" / "tier1-breached" /
 * "integrity-violated") and pipelineStatus (the single authoritative
 * correctness/progress summary).
 */
export const DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band widths calibrated to THIS scenario's real authored
      // timeline: the fastest possible genuine OPTIMAL (fully-
      // recovered) resolution requires the longest drain window on top
      // of sustained-lag onset — recoveryTimeSeconds ~719-760s — so the
      // top band must extend far enough to include it, not merely the
      // faster ACCEPTABLE tier's ~299s. Both the fastest acceptable
      // finish and the fastest optimal finish land in this same top
      // band on recovery time alone; it is dataIntegrity (not recovery)
      // that must be the dimension separating them (see its penalty
      // widths below) — recovery/customerImpact reward "handed back
      // quickly," which both tiers genuinely satisfy; they are not the
      // dimensions meant to express "finished vs. still draining."
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 800, points: 300 },
        { atMost: 1_000, points: 250 },
        { atMost: 1_300, points: 170 },
        { atMost: 1_600, points: 100 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 400, points: 200 },
        { atMost: 900, points: 160 },
        { atMost: 1_800, points: 110 },
        { atMost: 3_200, points: 60 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment: penalties mode on two closed-enum
      // string-state fields. A fully "recovered" path with
      // servingFreshnessStatus "fresh" keeps the full 200 points. A
      // "draining" path (the acceptable tier — genuinely safe, Tier-1
      // protected, Warehouse safe, backlog bounded and shrinking) loses
      // a modest, real amount of credit relative to full recovery.
      // Breaching Tier-1's SLO or dropping events loses substantially
      // more credit — these are the two outcomes this scenario must
      // never let look "almost optimal."
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "pipelineStatus", value: "diverging" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "pipelineStatus", value: "contended" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "pipelineStatus", value: "draining" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "servingFreshnessStatus", value: "tier1-breached" },
          atLeast: 1,
          subtractPoints: 120,
        },
        {
          measure: { type: "finalStringEquals", field: "servingFreshnessStatus", value: "integrity-violated" },
          atLeast: 1,
          subtractPoints: 200,
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
        { atMost: 0.3, points: 80 },
        { atMost: 0.6, points: 55 },
        { atMost: 1.2, points: 25 },
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
