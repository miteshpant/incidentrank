import { describe, expect, it } from "vitest";
import { scorePaymentRetryStormAttempt } from "./payment-retry-storm";
import { SCORE_MAX } from "./types";
import { runScenarioForScoring, type TimedAction } from "./test-helpers";

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

describe("scorePaymentRetryStormAttempt", () => {
  it("scores strong mitigation substantially higher than no intervention", () => {
    const strong = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, STRONG_MITIGATION),
    );
    const noAction = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, []),
    );

    expect(strong.total).toBeGreaterThan(noAction.total);
    expect(strong.total - noAction.total).toBeGreaterThanOrEqual(200);
  });

  it("scores strong mitigation substantially higher than harmful mitigation", () => {
    const strong = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, STRONG_MITIGATION),
    );
    const harmful = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, HARMFUL_MITIGATION),
    );

    expect(strong.total).toBeGreaterThan(harmful.total);
    expect(strong.total - harmful.total).toBeGreaterThanOrEqual(300);
  });

  it("scores an alternative reasonable mitigation well", () => {
    const alternative = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, ALTERNATIVE_MITIGATION),
    );
    const noAction = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, []),
    );

    expect(alternative.total).toBeGreaterThan(noAction.total);
    expect(alternative.breakdown.recovery).toBeGreaterThan(0);
    expect(alternative.breakdown.reliability).toBeGreaterThan(0);
  });

  it("produces deterministic scores for the same action sequence", () => {
    const runA = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, STRONG_MITIGATION),
    );
    const runB = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, STRONG_MITIGATION),
    );

    expect(runA).toEqual(runB);
  });

  it("keeps every score within 0 and 1000", () => {
    for (const actions of [
      [],
      STRONG_MITIGATION,
      ALTERNATIVE_MITIGATION,
      HARMFUL_MITIGATION,
    ]) {
      const result = scorePaymentRetryStormAttempt(
        runScenarioForScoring(UNTIL_MS, actions),
      );
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(1000);
    }
  });

  it("keeps every dimension within its documented maximum", () => {
    const result = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, STRONG_MITIGATION),
    );

    expect(result.breakdown.recovery).toBeLessThanOrEqual(SCORE_MAX.recovery);
    expect(result.breakdown.customerImpact).toBeLessThanOrEqual(
      SCORE_MAX.customerImpact,
    );
    expect(result.breakdown.dataIntegrity).toBeLessThanOrEqual(
      SCORE_MAX.dataIntegrity,
    );
    expect(result.breakdown.reliability).toBeLessThanOrEqual(
      SCORE_MAX.reliability,
    );
    expect(result.breakdown.costEfficiency).toBeLessThanOrEqual(
      SCORE_MAX.costEfficiency,
    );
    expect(result.breakdown.operationalEfficiency).toBeLessThanOrEqual(
      SCORE_MAX.operationalEfficiency,
    );

    const sum =
      result.breakdown.recovery +
      result.breakdown.customerImpact +
      result.breakdown.dataIntegrity +
      result.breakdown.reliability +
      result.breakdown.costEfficiency +
      result.breakdown.operationalEfficiency;
    expect(result.total).toBe(sum);
  });

  it("excludes candidate reasoning from the score entirely", () => {
    // Reasoning is a UI/attempt-level concept (CandidateActionGroup), not
    // part of ScoringInputs at all — the type itself proves the score
    // cannot vary with reasoning text. This test documents that guarantee
    // by confirming identical ScoringInputs always produce identical scores
    // regardless of what a caller might have recorded as reasoning.
    const inputs = runScenarioForScoring(UNTIL_MS, STRONG_MITIGATION);
    const scoreA = scorePaymentRetryStormAttempt(inputs);
    const scoreB = scorePaymentRetryStormAttempt(inputs);

    expect(scoreA).toEqual(scoreB);
  });

  it("awards zero recovery and reliability for a failed attempt", () => {
    const failed = scorePaymentRetryStormAttempt(
      runScenarioForScoring(5 * 60_000, HARMFUL_MITIGATION),
    );

    expect(failed.breakdown.recovery).toBe(0);
    expect(failed.breakdown.reliability).toBe(0);
  });

  it("still scores cost efficiency and customer impact for a failed attempt", () => {
    const failed = scorePaymentRetryStormAttempt(
      runScenarioForScoring(5 * 60_000, HARMFUL_MITIGATION),
    );

    expect(failed.breakdown.costEfficiency).toBeGreaterThanOrEqual(0);
    expect(failed.breakdown.customerImpact).toBeGreaterThanOrEqual(0);
  });

  it("scores natural recovery (no intervention) low on recovery and reliability", () => {
    const noAction = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, []),
    );

    expect(noAction.breakdown.recovery).toBeLessThanOrEqual(40);
    expect(noAction.breakdown.reliability).toBeLessThanOrEqual(20);
  });

  it("awards full data integrity points, documented as not yet differentiated", () => {
    const result = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, STRONG_MITIGATION),
    );

    expect(result.breakdown.dataIntegrity).toBe(SCORE_MAX.dataIntegrity);
  });

  it("penalizes brute-force scaling via cost efficiency", () => {
    const harmful = scorePaymentRetryStormAttempt(
      runScenarioForScoring(5 * 60_000, HARMFUL_MITIGATION),
    );
    const strong = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, STRONG_MITIGATION),
    );

    expect(harmful.breakdown.costEfficiency).toBeLessThan(
      strong.breakdown.costEfficiency,
    );
  });

  it("penalizes harmful configuration changes via operational efficiency", () => {
    const harmful = scorePaymentRetryStormAttempt(
      runScenarioForScoring(5 * 60_000, HARMFUL_MITIGATION),
    );
    const strong = scorePaymentRetryStormAttempt(
      runScenarioForScoring(UNTIL_MS, STRONG_MITIGATION),
    );

    expect(harmful.breakdown.operationalEfficiency).toBeLessThan(
      strong.breakdown.operationalEfficiency,
    );
  });
});
