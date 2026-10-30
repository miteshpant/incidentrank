import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { poisonMessageLoop } from "./poison-message-loop";
import {
  CONSUMER_CONCURRENCY_KEY,
  DEAD_LETTER_QUEUE_ENABLED_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  poisonMessageLoopSimulation,
} from "./poison-message-loop/definition";
import { POISON_MESSAGE_LOOP_SCORING } from "./poison-message-loop/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(poisonMessageLoopSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += poisonMessageLoopSimulation.tickMs
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
      poisonMessageLoopSimulation,
      state,
      action,
      poisonMessageLoopSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Poison Message Loop", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(poisonMessageLoop.isFree).toBe(false);
    expect(poisonMessageLoop.library?.category).toBe("Messaging & Streaming");
    expect(poisonMessageLoop.library?.tags.length).toBeGreaterThan(0);
    expect(poisonMessageLoop.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(poisonMessageLoopSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.queueDepth).toBe(20);
    expect(state.values.queueStatus).toBe("normal");
  });

  it("loops critically when the poison message arrives with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.healthyMessageBacklog).toBe(1_000);
    expect(state.values.queueStatus).toBe("critical");
  });

  it("reaches a sustained healthy state with a bounded retry limit and the dead-letter queue enabled (Phase 6.1: candidate_declared, never auto-resolves)", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 3 },
      { atMs: 31_000, controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY, value: true },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.resolvedAtMs).toBeNull();
    expect(state.values.healthyMessageBacklog).toBe(0);
    expect(state.values.queueDepth).toBeLessThanOrEqual(50);
    expect(state.values.queueStatus).not.toBe("critical");
    expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
      poisonMessageLoopSimulation.successCondition.sustainedSeconds,
    );
  });

  it("scaling consumer concurrency without touching retries or the DLQ is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithScaledConcurrency = runScenario(35_000, [
      { atMs: 31_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 16 },
    ]);

    expect(stateWithScaledConcurrency.values.retryLoopCount).toBeGreaterThan(
      stateWithoutMitigation.values.retryLoopCount as number,
    );
    expect(stateWithScaledConcurrency.values.queueStatus).toBe("critical");
  });

  it("enabling the dead-letter queue without bounding retries never routes the poison message out", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY, value: true },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.healthyMessageBacklog).toBe(950);
  });

  it("a high but bounded retry limit recovers more slowly than a tight one", () => {
    const slow = runScenario(50_000, [
      { atMs: 31_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 50 },
      { atMs: 31_000, controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY, value: true },
    ]);

    expect(slow.status).not.toBe("resolved");
    expect(slow.values.queueStatus).toBe("warning");
    expect(slow.values.healthyMessageBacklog).toBe(380);
  });

  it("a high but bounded retry limit eventually exhausts and reaches a sustained healthy state (Phase 6.1: candidate_declared, never auto-resolves)", () => {
    // Regression test for a bug where "high-bounded-retries-with-dlq-slow"
    // had no time-based path to resolution at all — resolvedAtMs stayed
    // null forever, a genuine permanent dead-end rather than the "slow
    // recovery" the scenario's own docs describe. Fixed by adding a
    // highRetryLimitExhausted timed event (4 minutes after the retry
    // limit is set) and a recovery rule keyed on it.
    const slow = runScenario(5 * 60_000, [
      { atMs: 31_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 50 },
      { atMs: 31_000, controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY, value: true },
    ]);

    expect(slow.status).not.toBe("resolved");
    expect(slow.resolvedAtMs).toBeNull();
    expect(slow.values.healthyMessageBacklog).toBeLessThanOrEqual(20);
    expect(slow.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
      poisonMessageLoopSimulation.successCondition.sustainedSeconds,
    );
  });

  describe("scoring orders good > slow-but-real partial > baseline > harmful", () => {
    // Poison Message Loop is candidate_declared (Phase 6.1): the engine
    // never auto-writes resolvedAtMs, so score via the same Finish-
    // equivalent derivation finishAttempt uses for the genuinely-resolved
    // cases (good/slow) — never a raw extractScoringInputs call, which
    // would incorrectly score them as "unresolved".
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(poisonMessageLoopSimulation, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(poisonMessageLoopSimulation, finishResult)
          : extractScoringInputs(poisonMessageLoopSimulation, state);
      return scoreAuthoredAttempt(POISON_MESSAGE_LOOP_SCORING, inputs);
    }

    it("the slow-but-real partial scores between baseline and the full fast recovery", () => {
      const good = runScenario(60_000, [
        { atMs: 31_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 3 },
        { atMs: 31_000, controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY, value: true },
      ]);
      const slow = runScenario(5 * 60_000, [
        { atMs: 31_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 50 },
        { atMs: 31_000, controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY, value: true },
      ]);
      const baseline = runScenario(30_000 + 61_000);
      const harmful = runScenario(5 * 60_000, [
        { atMs: 31_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 8 },
      ]);

      expect(good.status).not.toBe("resolved");
      expect(
        good.transitions.consecutiveSuccessSeconds,
      ).toBeGreaterThanOrEqual(poisonMessageLoopSimulation.successCondition.sustainedSeconds);
      expect(slow.status).not.toBe("resolved");
      expect(
        slow.transitions.consecutiveSuccessSeconds,
      ).toBeGreaterThanOrEqual(poisonMessageLoopSimulation.successCondition.sustainedSeconds);
      expect(baseline.status).not.toBe("failed");
      expect(baseline.failedAtMs).toBeNull();
      expect(
        baseline.transitions.consecutiveFailureSeconds,
      ).toBeGreaterThanOrEqual(poisonMessageLoopSimulation.failureCondition.sustainedSeconds);
      expect(harmful.status).not.toBe("failed");
      expect(harmful.failedAtMs).toBeNull();
      expect(
        harmful.transitions.consecutiveFailureSeconds,
      ).toBeGreaterThanOrEqual(poisonMessageLoopSimulation.failureCondition.sustainedSeconds);

      const goodScore = scoreOf(good).total;
      const slowScore = scoreOf(slow).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;

      expect(goodScore).toBeGreaterThan(slowScore);
      expect(slowScore).toBeGreaterThan(baselineScore);
      expect(baselineScore).toBeGreaterThan(harmfulScore);
    });
  });

  it("stays active (never auto-fails) even after the healthy message backlog remains critical past the old sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      poisonMessageLoopSimulation.failureCondition.sustainedSeconds,
    );
  });

  it("tracks peak healthy message backlog generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.healthyMessageBacklog).toBe(1_000);
  });

  it("tracks monthly infrastructure cost that increases with consumer concurrency", () => {
    let state = createInitialState(poisonMessageLoopSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(100);

    const tickMs = poisonMessageLoopSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-concurrency",
      timestampMs: 0,
      controlKey: CONSUMER_CONCURRENCY_KEY,
      value: 16,
    };
    state = simulate(poisonMessageLoopSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(480);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 3 },
      { atMs: 31_000, controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
