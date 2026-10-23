import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Primary Database Failover's scoring configuration. This is one of
 * Phase 6B's explicitly correctness-critical scenarios (phase6b.md
 * section 10): a candidate can make write/read success rates read 100%
 * while the old primary is still a live, unfenced correctness hazard.
 * dataIntegrity therefore bands generically on `integrityStatus`
 * (set by rules.ts alongside the real staleWriteCount/lostWriteCount
 * fields it summarizes) via three stacked finalStringEquals penalties —
 * never a scenario-specific scorer, the same generic engine Kafka
 * Partition Skew and Missing Database Index already use for their own
 * string-state dataIntegrity-adjacent distinctions:
 *
 *   "clean"          (optimal: lag drained + fenced)     -> 200 (no penalty)
 *   "bounded-loss"   (acceptable: fenced immediately,
 *                     bounded one-time lostWriteCount)   -> 160 (-40)
 *   "split-primary"  (the trap: ONGOING unbounded
 *                     staleWriteCount while availability
 *                     looks fully healthy)               ->  20 (-180)
 *   "unresolved"     (no write-authority cutover reached) ->   0 (-200)
 *
 * Because `integrityStatus` can only ever equal exactly one of these
 * values at a time, at most one of the three penalties below can ever
 * match for a given attempt — there is no double-stacking risk.
 */
export const PRIMARY_DATABASE_FAILOVER_SCORING: AuthoredScoringConfig = {
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
      // The central correctness dimension (see file header). Never a
      // scenario-specific scorer — purely generic finalStringEquals
      // penalties against the authored integrityStatus field.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "integrityStatus", value: "bounded-loss" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          measure: { type: "finalStringEquals", field: "integrityStatus", value: "split-primary" },
          atLeast: 1,
          subtractPoints: 180,
        },
        {
          measure: { type: "finalStringEquals", field: "integrityStatus", value: "unresolved" },
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
