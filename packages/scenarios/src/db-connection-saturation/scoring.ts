import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Database Connection Saturation's own scoring configuration — expressed
 * through the same generic ScenarioScoringConfig/scoreAuthoredAttempt
 * engine Payment Retry Storm uses (see packages/scoring/src/
 * payment-retry-storm.ts), but tuned to this incident's own shape per
 * docs/implementation_plan/phase6.md's scoring-convergence mandate:
 * "its bands and measured signals can differ materially" from Payment
 * Retry Storm. In particular reliability here cares about time spent
 * with the connection pool/database in a critical state generically
 * (criticalTimeRatio), not provider-recovery semantics — this scenario
 * has no external-provider timeline at all, so no naturalRecoveryCondition
 * is declared.
 */
export const DB_CONNECTION_SATURATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 }, // <= 1:00
        { atMost: 120, points: 250 }, // <= 2:00
        { atMost: 180, points: 200 }, // <= 3:00
        { atMost: 300, points: 140 }, // <= 5:00
        { atMost: 480, points: 80 }, // <= 8:00
        { points: 30 },
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
        { atMost: 50_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // No duplicate/lost-write modeling yet — same documented
      // limitation as Payment Retry Storm v1: award full marks rather
      // than fabricate a signal.
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
        { atMost: 0.25, points: 85 },
        { atMost: 0.5, points: 65 },
        { atMost: 1, points: 35 },
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
