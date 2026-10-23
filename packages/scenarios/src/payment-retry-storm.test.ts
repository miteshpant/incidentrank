import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { paymentRetryStorm } from "./payment-retry-storm";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  BACKOFF_KEY,
  CIRCUIT_BREAKER_KEY,
  PAYMENT_INSTANCES_KEY,
  RETRIES_KEY,
} from "./payment-retry-storm/controls";
import { paymentRetryStormSimulation } from "./payment-retry-storm/definition";
import { paymentRetryStormScoring } from "./payment-retry-storm/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(paymentRetryStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += paymentRetryStormSimulation.tickMs
  ) {
    let action: CandidateAction | null = null;

    if (actionIndex < actions.length && actions[actionIndex]!.atMs <= timeMs) {
      const pending = actions[actionIndex]!;
      actionCounter += 1;
      action = {
        id: `action-${actionCounter}`,
        timestampMs: timeMs,
        controlKey: pending.controlKey,
        value: pending.value,
      };
      actionIndex += 1;
    }

    const result = simulate(
      paymentRetryStormSimulation,
      state,
      action,
      paymentRetryStormSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("paymentRetryStorm", () => {
  it("loads valid scenario metadata", () => {
    expect(paymentRetryStorm.slug).toBe("payment-retry-storm");
    expect(paymentRetryStorm.name).toBe("Payment Retry Storm");
    expect(paymentRetryStorm.difficulty).toBe("senior");
    expect(paymentRetryStorm.estimatedMinutes).toBeGreaterThan(0);
    expect(paymentRetryStorm.description.length).toBeGreaterThan(0);
    expect(paymentRetryStorm.isFree).toBe(true);
  });

  describe("scoring orders good > partial > baseline > harmful", () => {
    // Payment Retry Storm is candidate_declared (Phase 6.1): the engine
    // never auto-writes resolvedAtMs even on genuine sustained success, so
    // score via the same Finish-equivalent derivation finishAttempt uses
    // for a genuinely-resolved case (good) — never a raw
    // extractScoringInputs call, which would incorrectly score it via the
    // unresolved bucket. See poison-message-loop.test.ts and
    // authentication-service-degradation.test.ts for the same pattern.
    //
    // packages/scoring/src/payment-retry-storm.test.ts and
    // resume-equality.test.ts already cover this exact
    // paymentRetryStormScoring config (imported verbatim from this
    // package) with their own good/baseline/harmful/alternative ordering
    // assertions — but that coverage lives in a different workspace and
    // always takes the Finish-equivalent path unconditionally, so it
    // never exercises the unresolved-bucket branch a genuine baseline or
    // harmful run takes here. This test adds that missing branch coverage
    // in-package rather than duplicating the resolved-path assertions.
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(paymentRetryStormSimulation, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(paymentRetryStormSimulation, finishResult)
          : extractScoringInputs(paymentRetryStormSimulation, state);
      return scoreAuthoredAttempt(paymentRetryStormScoring, inputs);
    }

    it("orders good > partial > baseline > harmful", () => {
      // Good: circuit-breaker-good-recovery rule (retries<=1, backoff
      // exponential, circuitBreaker on) reaches checkoutSuccessRate 96,
      // p99 1600ms, paymentTraffic/dbPressure normal — satisfies
      // successCondition and sustains it (simulation.test.ts "13. good
      // recovery").
      const good = runScenario(240_000, [
        { atMs: 65_000, controlKey: RETRIES_KEY, value: 1 },
        { atMs: 90_000, controlKey: BACKOFF_KEY, value: "exponential" },
        { atMs: 120_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
      ]);

      // Partial: low-retries-no-backoff rule (retries<=1 alone) reaches
      // only checkoutSuccessRate 84 — a real, distinct storm-reduced
      // incidentState, genuinely better than baseline's storm-critical
      // but nowhere near successCondition's 95 threshold.
      const partial = runScenario(5 * 60_000, [
        { atMs: 65_000, controlKey: RETRIES_KEY, value: 1 },
      ]);

      // Baseline: no action at all. storm-critical-default holds
      // checkoutSuccessRate at 72, which never drops below
      // failureCondition's 60 threshold, so this run stays unresolved
      // indefinitely rather than failing.
      const baseline = runScenario(5 * 60_000);

      // Harmful: aggressive-scaling-high-retries rule (paymentInstances
      // >= 16 and retries >= 3) drives checkoutSuccessRate down to 58,
      // below the failureCondition's 60 threshold, sustained for the full
      // 3-minute window -> genuine "failed" status (simulation.test.ts
      // "15. bad configuration").
      const harmful = runScenario(66_000 + 3 * 60_000 + 1_000, [
        { atMs: 65_000, controlKey: PAYMENT_INSTANCES_KEY, value: 24 },
        { atMs: 65_000, controlKey: RETRIES_KEY, value: 5 },
      ]);

      expect(good.status).not.toBe("resolved");
      expect(good.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        paymentRetryStormSimulation.successCondition.sustainedSeconds,
      );
      expect(partial.status).not.toBe("resolved");
      expect(partial.values.checkoutSuccessRate).toBe(84);
      expect(baseline.status).not.toBe("resolved");
      expect(baseline.status).not.toBe("failed");
      expect(harmful.status).toBe("failed");

      const goodScore = scoreOf(good).total;
      const partialScore = scoreOf(partial).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;

      expect(goodScore).toBeGreaterThan(partialScore);
      expect(partialScore).toBeGreaterThan(baselineScore);
      expect(baselineScore).toBeGreaterThan(harmfulScore);
    });
  });
});
