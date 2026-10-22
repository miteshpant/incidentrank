import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { cascadingServiceFailure } from "./cascading-service-failure";
import {
  cascadingServiceFailureSimulation,
  REQUEST_QUEUE_DEPTH_LIMIT_KEY,
  ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
  UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
} from "./cascading-service-failure/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(cascadingServiceFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += cascadingServiceFailureSimulation.tickMs
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
      cascadingServiceFailureSimulation,
      state,
      action,
      cascadingServiceFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Cascading Service Failure", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(cascadingServiceFailure.isFree).toBe(false);
    expect(cascadingServiceFailure.library?.category).toBe("Distributed Systems");
    expect(cascadingServiceFailure.library?.tags.length).toBeGreaterThan(0);
    expect(cascadingServiceFailure.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(cascadingServiceFailureSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.cascadeDepth).toBe(0);
    expect(state.values.chainStatus).toBe("normal");
  });

  it("cascades critically when the root service fails with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.cascadeDepth).toBe(3);
    expect(state.values.checkoutSuccessRate).toBe(55);
  });

  it("recovers checkout success by isolating the root cause, even though the root service itself stays unhealthy", () => {
    const state = runScenario(55_000, [
      { atMs: 31_000, controlKey: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.checkoutSuccessRate).toBe(99.5);
    // The root cause is never actually fixed by isolation alone — this is
    // the scenario's central point: isolating a failure is not the same
    // as repairing it.
    expect(state.values.rootServiceErrorRate).toBe(95);
  });

  it("restarting the healthy upstream services is harmful, not helpful, and does not touch the root cause", () => {
    const stateWithoutMitigation = runScenario(35_000);

    const stateWithHarmfulRestart = runScenario(35_000, [
      { atMs: 31_000, controlKey: UPSTREAM_SERVICE_RESTART_ENABLED_KEY, value: true },
    ]);

    expect(stateWithHarmfulRestart.values.checkoutSuccessRate).toBeLessThan(
      stateWithoutMitigation.values.checkoutSuccessRate as number,
    );
    expect(stateWithHarmfulRestart.values.rootServiceErrorRate).toBe(95);
    expect(stateWithHarmfulRestart.values.chainStatus).toBe("critical");
  });

  it("a tight queue depth limit alone sheds load and prevents total collapse, but does not fully recover checkout", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: REQUEST_QUEUE_DEPTH_LIMIT_KEY, value: 200 },
    ]);

    expect(state.values.checkoutSuccessRate).toBe(65);
    expect(state.status).not.toBe("resolved");
  });

  it("the cascade widens further if left unmitigated past the second escalation", () => {
    const state = runScenario(3 * 60_000 + 10_000);
    expect(state.values.cascadeDepth).toBe(5);
    expect(state.values.checkoutSuccessRate).toBe(20);
  });

  it("fails if checkout success stays critically low for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak cascade depth generically via numericWatchFields", () => {
    const state = runScenario(3 * 60_000 + 10_000);
    expect(state.peaks.peakValues.cascadeDepth).toBe(5);
  });

  it("tracks monthly infrastructure cost that increases with the queue depth limit", () => {
    let state = createInitialState(cascadingServiceFailureSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(180);

    const tickMs = cascadingServiceFailureSimulation.tickMs;
    const action: CandidateAction = {
      id: "raise-queue-limit",
      timestampMs: 0,
      controlKey: REQUEST_QUEUE_DEPTH_LIMIT_KEY,
      value: 5_000,
    };
    state = simulate(cascadingServiceFailureSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(330);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: REQUEST_QUEUE_DEPTH_LIMIT_KEY, value: 1_000 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
