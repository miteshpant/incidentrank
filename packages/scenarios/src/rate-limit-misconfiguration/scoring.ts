import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Rate-Limit Misconfiguration's scoring configuration. This scenario's
 * sharpest correctness test is the emergency bypass: customer-facing
 * success/rejection metrics can look fully healthy while bypass is
 * active, but the fairness protection the limiter exists to provide is
 * gone. rateLimitStatus (set by rules.ts) is the real, authored signal
 * of whether that protection is actually in place — "unprotected" means
 * the bypass has removed it regardless of how healthy customerSuccessRate
 * reads. dataIntegrity bands on this generically via finalStringEquals
 * (the same pattern Missing Database Index uses for
 * orderHistoryQueryHealth and Kafka Partition Skew uses for
 * orderingMode) rather than tying the bypass path to the real fix at a
 * flat catch-all band.
 */
export const RATE_LIMIT_MISCONFIGURATION_SCORING: AuthoredScoringConfig = {
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
      // Penalty mode lets this dimension discriminate on TWO independent
      // generic string-state measures at once (bands mode only supports
      // one measure per dimension): rateLimitStatus === "unprotected"
      // (the emergency-bypass trap — fairness protection removed
      // entirely, regardless of how healthy customer-facing metrics
      // read) draws the heavy penalty; burstFairnessState === "uncapped"
      // (the priority-class acceptable path — legitimate traffic
      // protected, but the dominant tenant's own ceiling was never
      // capped) draws a light one. Neither penalty matches the optimal
      // "retuned-fair" path (rateLimitStatus="protected",
      // burstFairnessState="capped") or any still-unresolved/harmful
      // path (burstFairnessState="not-applicable" there), so both start
      // at the full 200 and only fall when one of these two real,
      // authored tradeoffs is actually present. No scenario-specific
      // scorer code — the same closed finalStringEquals measure type
      // Missing Database Index and Kafka Partition Skew already use.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "rateLimitStatus", value: "unprotected" },
          atLeast: 1,
          subtractPoints: 170,
        },
        {
          measure: { type: "finalStringEquals", field: "burstFairnessState", value: "uncapped" },
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
