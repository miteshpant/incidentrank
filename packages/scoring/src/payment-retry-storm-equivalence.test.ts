import type { ScoringInputs } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { scorePaymentRetryStormAttempt } from "./payment-retry-storm";
import { SCORE_MAX, type ScoreBreakdown, type ScoreResult } from "./types";
import { runScenarioForScoring, type TimedAction } from "./test-helpers";

const OLD_PROVIDER_RECOVERY_START_MS = 12 * 60 * 1000;

function oldClampScore(value: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(value)));
}

function oldScoreRecovery(inputs: ScoringInputs): number {
  if (inputs.resolvedAtMs === null || inputs.incidentStartedAtMs === null) return 0;
  const recoveryTimeMs = inputs.resolvedAtMs - inputs.incidentStartedAtMs;
  const isNaturalRecovery =
    inputs.numberOfBeneficialChanges === 0 &&
    recoveryTimeMs >= OLD_PROVIDER_RECOVERY_START_MS;
  if (isNaturalRecovery) return 40;
  const recoveryTimeSec = recoveryTimeMs / 1000;
  if (recoveryTimeSec <= 150) return 300;
  if (recoveryTimeSec <= 210) return 275;
  if (recoveryTimeSec <= 300) return 240;
  if (recoveryTimeSec <= 420) return 200;
  if (recoveryTimeSec <= 600) return 150;
  if (recoveryTimeSec <= 900) return 80;
  return 40;
}

function oldScoreCustomerImpact(inputs: ScoringInputs): number {
  const loss = inputs.revenueLossUsd;
  if (loss <= 20_000) return 200;
  if (loss <= 30_000) return 180;
  if (loss <= 50_000) return 150;
  if (loss <= 80_000) return 110;
  if (loss <= 120_000) return 70;
  if (loss <= 168_000) return 30;
  return 0;
}

function oldScoreDataIntegrity(): number {
  return SCORE_MAX.dataIntegrity;
}

function oldScoreReliability(inputs: ScoringInputs): number {
  if (inputs.resolvedAtMs === null) return 0;
  if (inputs.incidentStartedAtMs === null) return SCORE_MAX.reliability;
  const recoveryTimeMs = inputs.resolvedAtMs - inputs.incidentStartedAtMs;
  const isNaturalRecovery =
    inputs.numberOfBeneficialChanges === 0 &&
    recoveryTimeMs >= OLD_PROVIDER_RECOVERY_START_MS;
  if (isNaturalRecovery) return 20;
  const criticalRatio = recoveryTimeMs > 0 ? inputs.totalTimeInCriticalMs / recoveryTimeMs : 0;
  if (criticalRatio <= 0.2) return 150;
  if (criticalRatio <= 0.4) return 120;
  if (criticalRatio <= 0.6) return 90;
  if (criticalRatio <= 0.8) return 60;
  return 30;
}

function oldScoreCostEfficiency(inputs: ScoringInputs): number {
  const baseline = inputs.initialMonthlyInfrastructureCostUsd;
  if (baseline <= 0) return SCORE_MAX.costEfficiency;
  const increaseRatio = (inputs.peakMonthlyInfrastructureCostUsd - baseline) / baseline;
  if (increaseRatio <= 0) return 100;
  if (increaseRatio <= 0.1) return 90;
  if (increaseRatio <= 0.25) return 70;
  if (increaseRatio <= 0.5) return 40;
  return 10;
}

function oldScoreOperationalEfficiency(inputs: ScoringInputs): number {
  let score = SCORE_MAX.operationalEfficiency;
  if (inputs.numberOfHarmfulChanges === 1) {
    score -= 15;
  } else if (inputs.numberOfHarmfulChanges >= 2) {
    score -= 35;
  }
  if (inputs.numberOfConfigurationChanges > 8) {
    score -= 10;
  } else if (inputs.numberOfConfigurationChanges > 5) {
    score -= 5;
  }
  return Math.max(0, score);
}

/**
 * Byte-for-byte copy of the pre-Phase-6 hand-written
 * scorePaymentRetryStormAttempt, kept ONLY in this test file as the
 * reference oracle for the exact-equivalence assertions below. The real
 * implementation (./payment-retry-storm.ts) was rewritten to run through
 * the generic scoreAuthoredAttempt engine via a declarative
 * AuthoredScoringConfig — see docs/implementation_plan/phase6.md's
 * scoring-convergence mandate. Never resync this with product code;
 * its only purpose is proving the new declarative path reproduces the
 * old bespoke one exactly.
 */
function oldScorePaymentRetryStormAttempt(inputs: ScoringInputs): ScoreResult {
  const breakdown: ScoreBreakdown = {
    recovery: oldClampScore(oldScoreRecovery(inputs), SCORE_MAX.recovery),
    customerImpact: oldClampScore(oldScoreCustomerImpact(inputs), SCORE_MAX.customerImpact),
    dataIntegrity: oldClampScore(oldScoreDataIntegrity(), SCORE_MAX.dataIntegrity),
    reliability: oldClampScore(oldScoreReliability(inputs), SCORE_MAX.reliability),
    costEfficiency: oldClampScore(oldScoreCostEfficiency(inputs), SCORE_MAX.costEfficiency),
    operationalEfficiency: oldClampScore(
      oldScoreOperationalEfficiency(inputs),
      SCORE_MAX.operationalEfficiency,
    ),
  };

  const total = oldClampScore(
    breakdown.recovery +
      breakdown.customerImpact +
      breakdown.dataIntegrity +
      breakdown.reliability +
      breakdown.costEfficiency +
      breakdown.operationalEfficiency,
    1000,
  );

  return { total, breakdown, maxBreakdown: SCORE_MAX };
}

const PROVIDER_RECOVERY_END_MS = 15 * 60 * 1000;
const UNTIL_MS = PROVIDER_RECOVERY_END_MS + 60_000;

const STRONG_MITIGATION: TimedAction[] = [
  { atMs: 65_000, controlKey: "retries", value: 1 },
  { atMs: 90_000, controlKey: "backoff", value: "exponential" },
  { atMs: 120_000, controlKey: "circuitBreaker", value: "on" },
];

const ALTERNATIVE_MITIGATION: TimedAction[] = [
  { atMs: 65_000, controlKey: "retries", value: 1 },
  { atMs: 90_000, controlKey: "timeoutSeconds", value: 3 },
  { atMs: 110_000, controlKey: "backoff", value: "exponential" },
  { atMs: 140_000, controlKey: "circuitBreaker", value: "on" },
];

const HARMFUL_MITIGATION: TimedAction[] = [
  { atMs: 65_000, controlKey: "paymentInstances", value: 24 },
  { atMs: 70_000, controlKey: "retries", value: 5 },
  { atMs: 75_000, controlKey: "timeoutSeconds", value: 5 },
];

const SINGLE_HARMFUL_CHANGE: TimedAction[] = [
  { atMs: 65_000, controlKey: "retries", value: 5 },
];

const MANY_CONFIG_CHANGES: TimedAction[] = [
  { atMs: 60_000, controlKey: "retries", value: 1 },
  { atMs: 65_000, controlKey: "retries", value: 0 },
  { atMs: 70_000, controlKey: "retries", value: 1 },
  { atMs: 75_000, controlKey: "backoff", value: "exponential" },
  { atMs: 80_000, controlKey: "backoff", value: "fixed" },
  { atMs: 85_000, controlKey: "circuitBreaker", value: "on" },
  { atMs: 90_000, controlKey: "circuitBreaker", value: "off" },
];

/**
 * Phase 6 migration test: the real scorePaymentRetryStormAttempt must
 * reproduce this file's pinned pre-refactor oracle's exact total and all
 * six dimensions across every case below, including edge cases (failed,
 * natural recovery, harmful-change tiers, config-change tiers, unresolved
 * mid-attempt) the relative assertions in payment-retry-storm.test.ts
 * don't individually pin.
 */
describe("scorePaymentRetryStormAttempt — exact equivalence with the pre-refactor scorer", () => {
  const cases: Array<{ name: string; untilMs: number; actions: TimedAction[] }> = [
    { name: "no intervention (natural recovery)", untilMs: UNTIL_MS, actions: [] },
    { name: "strong mitigation", untilMs: UNTIL_MS, actions: STRONG_MITIGATION },
    { name: "alternative mitigation", untilMs: UNTIL_MS, actions: ALTERNATIVE_MITIGATION },
    { name: "harmful mitigation, resolved window", untilMs: UNTIL_MS, actions: HARMFUL_MITIGATION },
    {
      name: "harmful mitigation, early cutoff (failed)",
      untilMs: 5 * 60_000,
      actions: HARMFUL_MITIGATION,
    },
    { name: "single harmful change", untilMs: UNTIL_MS, actions: SINGLE_HARMFUL_CHANGE },
    { name: "many configuration changes", untilMs: UNTIL_MS, actions: MANY_CONFIG_CHANGES },
    {
      name: "cut off mid-incident (unresolved, not failed)",
      untilMs: 90_000,
      actions: STRONG_MITIGATION,
    },
  ];

  for (const { name, untilMs, actions } of cases) {
    it(`matches exactly for: ${name}`, () => {
      const inputs = runScenarioForScoring(untilMs, actions);
      const actual = scorePaymentRetryStormAttempt(inputs);
      const expected = oldScorePaymentRetryStormAttempt(inputs);

      expect(actual.total).toBe(expected.total);
      expect(actual.breakdown).toEqual(expected.breakdown);
    });
  }
});
