import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cascading Failure Across Shared Platform's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase6d.4.md section 17's score-sanity audit): a path that ever used
 * identity fail-open, or that re-cascaded via premature all-at-once
 * restoration, must score materially worse even if recovery time looks
 * fast. As with Authorization Policy Rollout Failure, the generic
 * scorer's literal "dataIntegrity" measure always returns 0 and there
 * is no numeric-threshold penalty measure (only the two string-state
 * forms, finalStringEquals/NotEquals), so this dimension uses
 * `penalties` mode against platformStatus (the single authoritative
 * correctness/progress summary) and metadataWriteSafety.
 */
export const CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band widths calibrated to this scenario's real authored
      // timeline: the fastest genuine OPTIMAL resolution requires
      // identityDegraded onset (20s) + starvationCompounded (140s) +
      // sustainedCascade (230s) + the longer of the two independent
      // drain windows (messaging's MSG_FULLY_DRAINED_MS, 6 minutes past
      // sustainedCascade) + identityRecoveryWindowElapsed, i.e.
      // recoveryTimeSeconds in roughly the 580-650s range at the
      // fastest. The ACCEPTABLE tier (drained but not yet restored)
      // reaches the same floor, since both tiers require the identical
      // drain windows to have elapsed — only platformStatus/
      // restorationOrder differ, which dataIntegrity (not recovery)
      // must separate.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 650, points: 300 },
        { atMost: 850, points: 250 },
        { atMost: 1_100, points: 170 },
        { atMost: 1_400, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Band widths calibrated to this scenario's real authored revenue
      // accrual: the fastest genuine OPTIMAL resolution accrues
      // ~$1,275 in revenue loss along the way (real, nonzero —
      // containment/drain take real elapsed minutes, not an instant
      // fix); a true zero-action baseline measured mid-incident (e.g.
      // ~145s in, well before any resolution) has accrued far less
      // ($678) purely because so little time has passed, NOT because
      // it is doing well — recovery/reliability's `unresolved`
      // terminalOverrides (both 0) are what keep that baseline's total
      // score low despite this dimension alone looking passable, per
      // the score-sanity audit (phase6d.4.md section 17: "zero-action
      // baseline not suspiciously high" is a property of the TOTAL
      // score, not every individual dimension in isolation).
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 1_400, points: 200 },
        { atMost: 2_000, points: 150 },
        { atMost: 2_600, points: 90 },
        { atMost: 3_500, points: 40 },
        { points: 10 },
      ],
    },
    {
      // Penalties mode on platformStatus (the authoritative summary)
      // and metadataWriteSafety. A fully "recovered" or safely
      // "contained" path (ACCEPTABLE) keeps the full 200 points. Any
      // path that ever reached "identity-correctness-violated" or
      // "re-cascading" loses the large majority of this dimension —
      // these are the two outcomes this scenario must never let look
      // "almost optimal." metadataWriteSafety "at-risk" at the FINAL
      // tick is a smaller, independent penalty.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "platformStatus", value: "amplifying" },
          atLeast: 1,
          subtractPoints: 70,
        },
        {
          measure: { type: "finalStringEquals", field: "platformStatus", value: "starving" },
          atLeast: 1,
          subtractPoints: 130,
        },
        {
          measure: { type: "finalStringEquals", field: "platformStatus", value: "draining" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "platformStatus", value: "contained" },
          atLeast: 1,
          subtractPoints: 30,
        },
        {
          measure: { type: "finalStringEquals", field: "platformStatus", value: "re-cascading" },
          atLeast: 1,
          subtractPoints: 150,
        },
        {
          measure: { type: "finalStringEquals", field: "platformStatus", value: "identity-correctness-violated" },
          atLeast: 1,
          subtractPoints: 200,
        },
        {
          measure: { type: "finalStringEquals", field: "metadataWriteSafety", value: "at-risk" },
          atLeast: 1,
          subtractPoints: 40,
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
        { atMost: 0.65, points: 40 },
        { points: 10 },
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
        { atMost: 1.0, points: 25 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 12 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 30 },
        { measure: "configurationChangeCount", atLeast: 10, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 16, subtractPoints: 10 },
      ],
    },
  ],
};
