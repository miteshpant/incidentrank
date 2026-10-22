import type { AuthoredScoringConfig } from "../authoring/schema";

const PROVIDER_RECOVERY_START_MS = 12 * 60 * 1000;

/**
 * Payment Retry Storm's scoring, expressed declaratively through the
 * generic ScenarioScoringConfig/scoreAuthoredAttempt engine every other
 * scenario (built-in or organization-authored) also uses — see
 * docs/implementation_plan/phase6.md's scoring-convergence mandate. This
 * is the Phase 6 migration test: every band/penalty/override below
 * reproduces the original hand-written scorePaymentRetryStormAttempt
 * point-for-point (see packages/scoring/src/
 * payment-retry-storm-equivalence.test.ts) — no behavior changed, only
 * how it's expressed. No AI, no subjective evaluation, no use of
 * candidate reasoning text, no scenario-specific code.
 */
export const paymentRetryStormScoring: AuthoredScoringConfig = {
  naturalRecoveryCondition: {
    maxBeneficialChanges: 0,
    minRecoveryTimeSeconds: PROVIDER_RECOVERY_START_MS / 1_000,
  },
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      naturalRecoveryOverride: { points: 40 },
      bands: [
        { atMost: 150, points: 300 }, // <= 2:30
        { atMost: 210, points: 275 }, // <= 3:30
        { atMost: 300, points: 240 }, // <= 5:00
        { atMost: 420, points: 200 }, // <= 7:00
        { atMost: 600, points: 150 }, // <= 10:00
        { atMost: 900, points: 80 }, // <= 15:00
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 20_000, points: 200 },
        { atMost: 30_000, points: 180 },
        { atMost: 50_000, points: 150 },
        { atMost: 80_000, points: 110 },
        { atMost: 120_000, points: 70 },
        { atMost: 168_000, points: 30 },
        { points: 0 },
      ],
    },
    {
      // Payment Retry Storm v1 does not model duplicate/lost
      // transactions, so there is no legitimate signal to grade against.
      // Per the spec, we do not fabricate one: award full points via a
      // single catch-all band and document the limitation rather than
      // invent variance.
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
      naturalRecoveryOverride: { points: 20 },
      bands: [
        { atMost: 0.2, points: 150 },
        { atMost: 0.4, points: 120 },
        { atMost: 0.6, points: 90 },
        { atMost: 0.8, points: 60 },
        { points: 30 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.1, points: 90 },
        { atMost: 0.25, points: 70 },
        { atMost: 0.5, points: 40 },
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
