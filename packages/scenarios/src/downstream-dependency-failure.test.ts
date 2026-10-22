import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { downstreamDependencyFailure } from "./downstream-dependency-failure";
import {
  CIRCUIT_BREAKER_ENABLED_KEY,
  downstreamDependencyFailureSimulation,
  FALLBACK_RESPONSE_ENABLED_KEY,
  REQUEST_TIMEOUT_MS_KEY,
} from "./downstream-dependency-failure/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(downstreamDependencyFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += downstreamDependencyFailureSimulation.tickMs
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
      downstreamDependencyFailureSimulation,
      state,
      action,
      downstreamDependencyFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Downstream Dependency Failure", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(downstreamDependencyFailure.isFree).toBe(false);
    expect(downstreamDependencyFailure.library?.category).toBe("Microservices & Dependencies");
    expect(downstreamDependencyFailure.library?.tags.length).toBeGreaterThan(0);
    expect(downstreamDependencyFailure.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(downstreamDependencyFailureSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.callingServiceThreadPoolUtilization).toBe(20);
    expect(state.values.callingServiceStatus).toBe("normal");
  });

  it("exhausts calling-service capacity critically when the downstream fails with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.callingServiceThreadPoolUtilization).toBe(92);
    expect(state.values.callingServiceStatus).toBe("critical");
  });

  it("recovers cleanly when the circuit breaker is enabled", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: CIRCUIT_BREAKER_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.callingServiceThreadPoolUtilization).toBe(25);
  });

  it("lengthening the request timeout without the circuit breaker is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithLongTimeout = runScenario(35_000, [
      { atMs: 31_000, controlKey: REQUEST_TIMEOUT_MS_KEY, value: 20_000 },
    ]);

    expect(stateWithLongTimeout.values.callingServiceThreadPoolUtilization).toBeGreaterThan(
      stateWithoutMitigation.values.callingServiceThreadPoolUtilization as number,
    );
    expect(stateWithLongTimeout.values.callingServiceStatus).toBe("critical");
  });

  it("shortening the request timeout alone (no circuit breaker) is a partial improvement, not a full fix", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: REQUEST_TIMEOUT_MS_KEY, value: 500 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.callingServiceStatus).toBe("warning");
    expect(state.values.queuedRequests).toBe(180);
  });

  it("fails if the request queue stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak queued requests generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.queuedRequests).toBe(450);
  });

  it("tracks monthly infrastructure cost that increases when the fallback response path is enabled", () => {
    let state = createInitialState(downstreamDependencyFailureSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(90);

    const tickMs = downstreamDependencyFailureSimulation.tickMs;
    const action: CandidateAction = {
      id: "enable-fallback",
      timestampMs: 0,
      controlKey: FALLBACK_RESPONSE_ENABLED_KEY,
      value: true,
    };
    state = simulate(downstreamDependencyFailureSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(130);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: CIRCUIT_BREAKER_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: FALLBACK_RESPONSE_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
