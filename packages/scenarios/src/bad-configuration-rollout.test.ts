import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { badConfigurationRollout } from "./bad-configuration-rollout";
import {
  API_SERVICE_INSTANCES_KEY,
  badConfigurationRolloutSimulation,
  CONFIG_CHANGE_FREEZE_ENABLED_KEY,
  CONFIG_REVERT_ENABLED_KEY,
} from "./bad-configuration-rollout/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(badConfigurationRolloutSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += badConfigurationRolloutSimulation.tickMs
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
      badConfigurationRolloutSimulation,
      state,
      action,
      badConfigurationRolloutSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Bad Configuration Rollout", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(badConfigurationRollout.isFree).toBe(false);
    expect(badConfigurationRollout.library?.category).toBe("Deployments & Reliability");
    expect(badConfigurationRollout.library?.tags.length).toBeGreaterThan(0);
    expect(badConfigurationRollout.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(badConfigurationRolloutSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.requestRejectionRate).toBe(0.1);
    expect(state.values.configStatus).toBe("normal");
  });

  it("goes critical when the bad config is pushed with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.requestRejectionRate).toBe(58);
    expect(state.values.configStatus).toBe("critical");
  });

  it("recovers cleanly by reverting to the last-known-good configuration", () => {
    const state = runScenario(45_000, [
      { atMs: 31_000, controlKey: CONFIG_REVERT_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.requestRejectionRate).toBe(0.2);
    expect(state.values.configStatus).toBe("normal");
  });

  it("scaling up API service instances without reverting is a plausible-but-harmful trap", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: API_SERVICE_INSTANCES_KEY, value: 8 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.requestRejectionRate).toBe(62);
    expect(state.values.configStatus).toBe("critical");
    expect(state.values.apiServiceCpuUtilization).toBeLessThanOrEqual(20);
  });

  it("freezing further config changes without reverting the bad one leaves the incident unresolved", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: CONFIG_CHANGE_FREEZE_ENABLED_KEY, value: true },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.requestRejectionRate).toBe(60);
    expect(state.values.configStatus).toBe("critical");
  });

  it("reverting wins even if instances were already scaled up as a trap", () => {
    const state = runScenario(45_000, [
      { atMs: 31_000, controlKey: API_SERVICE_INSTANCES_KEY, value: 8 },
      { atMs: 32_000, controlKey: CONFIG_REVERT_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.requestRejectionRate).toBe(0.2);
  });

  it("fails if the request rejection rate stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak affected user count generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.affectedUserCount).toBe(8_000);
  });

  it("tracks monthly infrastructure cost that increases with API service instances", () => {
    let state = createInitialState(badConfigurationRolloutSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(150);

    const tickMs = badConfigurationRolloutSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-instances",
      timestampMs: 0,
      controlKey: API_SERVICE_INSTANCES_KEY,
      value: 8,
    };
    state = simulate(badConfigurationRolloutSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(430);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: CONFIG_REVERT_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
