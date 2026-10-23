import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Deadlock Storm's own scoring configuration. PostgreSQL deadlock
 * detection aborts one of the two conflicting transactions atomically —
 * no partial writes land, so this scenario does not model a data-
 * corruption risk the way duplicate-processing or split-brain scenarios
 * do. dataIntegrity is awarded via a single catch-all band, the same
 * documented limitation every other built-in scenario with no real
 * integrity-violation measure uses (see poison-message-loop/scoring.ts).
 *
 * The scenario's real teaching point — masking (retry/concurrency
 * amplification) vs removing (lock ordering / write serialization) the
 * root cause — is captured by reliability (criticalTimeRatio, which the
 * masking paths spend far longer in) and operationalEfficiency (which
 * penalizes the harmful retry/concurrency classifications directly), not
 * by inventing a bespoke measure.
 */
export const DEADLOCK_STORM_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 250 },
        { atMost: 180, points: 200 },
        { atMost: 300, points: 140 },
        { atMost: 480, points: 80 },
        { points: 30 },
      ],
    },
    {
      // `failed` gets its own terminal override (mirroring Rate-Limit
      // Failure's precedent): an attempt left to actively breach the
      // failure threshold is the worst customer outcome regardless of how
      // quickly it failed, so it must never be able to land in the same
      // generous low-revenue-loss band an early-but-unresolved attempt
      // would — see docs/implementation_plan/phase6b.md section 17's
      // suspicious-tie investigation requirement.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      terminalOverrides: { failed: 20 },
      bands: [
        { atMost: 5_000, points: 200 },
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
