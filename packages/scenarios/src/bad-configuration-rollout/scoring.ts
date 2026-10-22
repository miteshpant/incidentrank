import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Bad Configuration Rollout's own scoring configuration — tuned tighter
 * and faster than other scenarios in the batch, since a config revert is
 * meant to be a cheap, fast mitigation rather than a multi-step recovery.
 * reliability is weighted on time spent with a critical configStatus
 * (criticalTimeRatio), matching the generic convention used across
 * scenarios with no external-provider timeline.
 *
 * costEfficiency and operationalEfficiency are both `penalties`-mode
 * (rather than costEfficiency's old bands-only shape) so each can add an
 * "unresolved tax": a `recoveryTimeSeconds`-keyed penalty that only fires
 * when the attempt never actually resolved. `measureDimension` returns
 * `Number.POSITIVE_INFINITY` for recoveryTimeSeconds whenever
 * resolvedAtMs is null (see ../authoring/score.ts), which is true for
 * both the failed and the unresolved-timeout case — so this one penalty
 * covers both terminal outcomes without needing terminalOverrides (which
 * would floor the dimension to one flat value and erase the real
 * cost/harmful-change distinction between doing nothing and actively
 * wasting money). The tax exists because zero candidate actions on a
 * still-broken incident is not "perfectly cost/operationally efficient"
 * — it's just inaction that happened to avoid *additional* cost/changes.
 * Without it, the do-nothing baseline (costIncreaseRatio 0,
 * harmfulChangeCount 0) scored the max on both dimensions even though the
 * incident never recovered, outscoring the scale-to-8-without-revert trap
 * that is actively worse. The 100000s threshold is unreachable by any
 * real resolvedAtMs/incidentStartedAtMs delta in this scenario (whose
 * failure condition fires within ~90s) — it exists purely to select the
 * Infinity sentinel, not to band real recovery times.
 */
export const BAD_CONFIGURATION_ROLLOUT_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 20, points: 300 },
        { atMost: 45, points: 250 },
        { atMost: 75, points: 200 },
        { atMost: 120, points: 140 },
        { atMost: 240, points: 80 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 3_000, points: 200 },
        { atMost: 15_000, points: 160 },
        { atMost: 30_000, points: 110 },
        { atMost: 50_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: "dataIntegrity",
      bands: [{ points: 200 }],
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
      penalties: [
        { measure: "costIncreaseRatio", atLeast: 0.5, subtractPoints: 15 },
        { measure: "costIncreaseRatio", atLeast: 1.5, subtractPoints: 35 },
        { measure: "costIncreaseRatio", atLeast: 3, subtractPoints: 65 },
        { measure: "recoveryTimeSeconds", atLeast: 100_000, subtractPoints: 20 },
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
        { measure: "recoveryTimeSeconds", atLeast: 100_000, subtractPoints: 20 },
      ],
    },
  ],
};
