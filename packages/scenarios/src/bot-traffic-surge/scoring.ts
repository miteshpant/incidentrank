import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Bot Traffic Surge's scoring configuration. This scenario's real
 * tradeoff is "protect the platform vs. harm real customers while doing
 * it," so dataIntegrity bands on defenseMode generically via
 * finalStringEquals (same pattern as Missing Database Index's
 * orderHistoryQueryHealth and Kafka Partition Skew's orderingMode):
 * "targeted" (the real fix) earns full marks, "coarse-blocked" (friction
 * applied uniformly, with a real measured false-positive cost) is
 * penalized even when backend-facing metrics recovered, and
 * "unresolved" falls through to the same full-marks band as "targeted"
 * since an unresolved/never-finished attempt is already penalized
 * elsewhere (recovery/reliability terminal overrides) rather than being
 * double-penalized here. No scenario-specific scorer code — the same
 * closed string-state measure every prior scenario already uses.
 */
export const BOT_TRAFFIC_SURGE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 250 },
        { atMost: 240, points: 190 },
        { atMost: 360, points: 130 },
        { atMost: 540, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 8_000, points: 200 },
        { atMost: 22_000, points: 160 },
        { atMost: 40_000, points: 110 },
        { atMost: 70_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure comparing defenseMode against
      // "coarse-blocked" — the uniform-friction path that produces a
      // real, measured customer false-positive cost even when backend
      // load looks healthy. measureDimension returns 1 when it matches
      // (penalized) and 0 otherwise (full marks for "targeted" and for
      // any still-unresolved/harmful path, which are already scored
      // elsewhere).
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "defenseMode", value: "coarse-blocked" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 90 },
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
