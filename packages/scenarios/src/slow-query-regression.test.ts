import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { slowQueryRegression } from "./slow-query-regression";
import {
  CONNECTION_POOL_SIZE_KEY,
  FORCE_INDEX_HINT_ENABLED_KEY,
  QUERY_TIMEOUT_MS_KEY,
  slowQueryRegressionSimulation,
} from "./slow-query-regression/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(slowQueryRegressionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += slowQueryRegressionSimulation.tickMs
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
      slowQueryRegressionSimulation,
      state,
      action,
      slowQueryRegressionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Slow Query Regression", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(slowQueryRegression.isFree).toBe(false);
    expect(slowQueryRegression.library?.category).toBe("Databases & Storage");
    expect(slowQueryRegression.library?.tags.length).toBeGreaterThan(0);
    expect(slowQueryRegression.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(slowQueryRegressionSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.cpuUtilization).toBe(15);
    expect(state.values.queryStatus).toBe("normal");
  });

  it("regresses critically when the trigger fires with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.cpuUtilization).toBe(95);
    expect(state.values.queryStatus).toBe("critical");
  });

  it("recovers cleanly when the index hint is forced", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: FORCE_INDEX_HINT_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.cpuUtilization).toBe(18);
  });

  it("scaling the connection pool without the index hint is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithPoolScaling = runScenario(35_000, [
      { atMs: 31_000, controlKey: CONNECTION_POOL_SIZE_KEY, value: 100 },
    ]);

    expect(stateWithPoolScaling.values.cpuUtilization).toBeGreaterThan(
      stateWithoutMitigation.values.cpuUtilization as number,
    );
    expect(stateWithPoolScaling.values.queryStatus).toBe("critical");
  });

  it("an aggressive timeout masks the symptom but never resolves the regression", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: QUERY_TIMEOUT_MS_KEY, value: 1_000 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.queryStatus).toBe("warning");
    expect(state.values.cpuUtilization).toBe(70);
  });

  it("fails if CPU utilization stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak CPU utilization generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.cpuUtilization).toBe(95);
  });

  it("tracks monthly infrastructure cost that increases with connection pool size", () => {
    let state = createInitialState(slowQueryRegressionSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(140);

    const tickMs = slowQueryRegressionSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-pool",
      timestampMs: 0,
      controlKey: CONNECTION_POOL_SIZE_KEY,
      value: 200,
    };
    state = simulate(slowQueryRegressionSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(520);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: FORCE_INDEX_HINT_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: QUERY_TIMEOUT_MS_KEY, value: 5_000 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
