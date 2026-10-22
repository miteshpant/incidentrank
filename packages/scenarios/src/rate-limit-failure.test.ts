import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { rateLimitFailure } from "./rate-limit-failure";
import {
  CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
  rateLimitFailureSimulation,
  REQUEST_CONCURRENCY_KEY,
  RETRY_BACKOFF_STRATEGY_KEY,
} from "./rate-limit-failure/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(rateLimitFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += rateLimitFailureSimulation.tickMs
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
      rateLimitFailureSimulation,
      state,
      action,
      rateLimitFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Rate-Limit Failure", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(rateLimitFailure.isFree).toBe(false);
    expect(rateLimitFailure.library?.category).toBe("API & Traffic");
    expect(rateLimitFailure.library?.tags.length).toBeGreaterThan(0);
    expect(rateLimitFailure.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(rateLimitFailureSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.rateLimitStatus).toBe("normal");
  });

  it("throttles critically when the rate limit is exceeded with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.rateLimitViolationRate).toBe(42);
    expect(state.values.rateLimitStatus).toBe("critical");
  });

  it("recovers cleanly with client-side rate limiting and exponential-with-jitter backoff", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "exponential-with-jitter" },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.rateLimitViolationRate).toBe(0.3);
  });

  it("raising request concurrency with no backoff is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithHarmfulConcurrency = runScenario(35_000, [
      { atMs: 31_000, controlKey: REQUEST_CONCURRENCY_KEY, value: 32 },
    ]);

    expect(stateWithHarmfulConcurrency.values.rateLimitViolationRate).toBeGreaterThan(
      stateWithoutMitigation.values.rateLimitViolationRate as number,
    );
    expect(stateWithHarmfulConcurrency.values.rateLimitStatus).toBe("critical");
  });

  it("exponential-with-jitter backoff alone is a partial improvement", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "exponential-with-jitter" },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.rateLimitStatus).toBe("warning");
    expect(state.values.rateLimitViolationRate).toBe(14);
  });

  it("fixed-delay backoff alone is a smaller partial improvement than exponential-with-jitter", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "fixed-delay" },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.rateLimitStatus).toBe("warning");
    expect(state.values.rateLimitViolationRate).toBe(28);
    expect(state.values.rateLimitViolationRate as number).toBeGreaterThan(14);
  });

  it("escalates when the provider tightens its limit further unmitigated", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.rateLimitStatus).toBe("critical");
    expect(state.values.rateLimitViolationRate).toBe(72);
  });

  it("fails if rate-limit violations stay critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak retry queue depth generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.retryQueueDepth).toBe(410);
  });

  it("tracks monthly infrastructure cost as a modest flat baseline", () => {
    const state = createInitialState(rateLimitFailureSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(60);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "exponential-with-jitter" },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
