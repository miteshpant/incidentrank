import { createInitialState, extractScoringInputs, simulate } from "@incidentrank/simulator";
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

  it("recovers cleanly with a bounded retry limit and the dead-letter queue enabled", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 3 },
      { atMs: 31_000, controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.healthyMessageBacklog).toBe(0);
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

  it("a high but bounded retry limit eventually exhausts and routes the poison message out", () => {
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

    expect(slow.status).toBe("resolved");
    expect(slow.resolvedAtMs).not.toBeNull();
    expect(slow.values.healthyMessageBacklog).toBeLessThanOrEqual(20);
  });

  describe("scoring orders good > slow-but-real partial > baseline > harmful", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const inputs = extractScoringInputs(poisonMessageLoopSimulation, state);
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

      expect(good.status).toBe("resolved");
      expect(slow.status).toBe("resolved");
      expect(baseline.status).toBe("failed");
      expect(harmful.status).toBe("failed");

      const goodScore = scoreOf(good).total;
      const slowScore = scoreOf(slow).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;

      expect(goodScore).toBeGreaterThan(slowScore);
      expect(slowScore).toBeGreaterThan(baselineScore);
      expect(baselineScore).toBeGreaterThan(harmfulScore);
    });
  });

  it("fails if the healthy message backlog stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
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
