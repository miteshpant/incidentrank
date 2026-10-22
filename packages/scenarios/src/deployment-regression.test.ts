import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { deploymentRegression } from "./deployment-regression";
import {
  CANARY_TRAFFIC_PERCENT_KEY,
  DEBUG_LOGGING_ENABLED_KEY,
  deploymentRegressionSimulation,
  ROLLBACK_TO_PREVIOUS_VERSION_KEY,
} from "./deployment-regression/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(deploymentRegressionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += deploymentRegressionSimulation.tickMs
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
      deploymentRegressionSimulation,
      state,
      action,
      deploymentRegressionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Deployment Regression", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(deploymentRegression.isFree).toBe(false);
    expect(deploymentRegression.library?.category).toBe("Deployments & Reliability");
    expect(deploymentRegression.library?.tags.length).toBeGreaterThan(0);
    expect(deploymentRegression.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(deploymentRegressionSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.errorRate).toBe(0.1);
    expect(state.values.deployStatus).toBe("normal");
  });

  it("regresses critically when the deploy's regression is detected with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.errorRate).toBe(8.5);
    expect(state.values.deployStatus).toBe("critical");
  });

  it("recovers cleanly when rolled back to the previous version", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: ROLLBACK_TO_PREVIOUS_VERSION_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.errorRate).toBe(0.2);
  });

  it("recovers cleanly when canary traffic is driven to zero", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: CANARY_TRAFFIC_PERCENT_KEY, value: 0 },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.errorRate).toBe(0.2);
  });

  it("enabling debug logging without a traffic-routing change is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithDebugLoggingOnly = runScenario(35_000, [
      { atMs: 31_000, controlKey: DEBUG_LOGGING_ENABLED_KEY, value: true },
    ]);

    expect(stateWithDebugLoggingOnly.values.errorRate).toBeGreaterThan(
      stateWithoutMitigation.values.errorRate as number,
    );
    expect(stateWithDebugLoggingOnly.values.deployStatus).toBe("critical");
  });

  it("reducing canary traffic to 10% is a partial improvement", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: CANARY_TRAFFIC_PERCENT_KEY, value: 10 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.deployStatus).toBe("warning");
    expect(state.values.errorRate).toBe(1.2);
  });

  it("escalates once memory growth compounds the unmitigated regression", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.deployStatus).toBe("critical");
    expect(state.values.memoryUsageMb).toBe(1_400);
  });

  it("fails if error rate stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak error rate generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.errorRate).toBe(8.5);
  });

  it("keeps monthly infrastructure cost flat — these controls are deploy/traffic config, not infrastructure scaling", () => {
    let state = createInitialState(deploymentRegressionSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(120);

    const tickMs = deploymentRegressionSimulation.tickMs;
    const action: CandidateAction = {
      id: "rollback",
      timestampMs: 0,
      controlKey: ROLLBACK_TO_PREVIOUS_VERSION_KEY,
      value: true,
    };
    state = simulate(deploymentRegressionSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(120);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: ROLLBACK_TO_PREVIOUS_VERSION_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
