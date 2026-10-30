import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { scoreAuthoredAttempt } from "./authoring/score";
import { badConfigurationRollout } from "./bad-configuration-rollout";
import {
  API_SERVICE_INSTANCES_KEY,
  badConfigurationRolloutSimulation,
  CONFIG_CHANGE_FREEZE_ENABLED_KEY,
  CONFIG_REVERT_ENABLED_KEY,
} from "./bad-configuration-rollout/definition";
import { BAD_CONFIGURATION_ROLLOUT_SCORING } from "./bad-configuration-rollout/scoring";

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

    // The engine itself never auto-writes "resolved" (Phase 7.1 doctrine)
    // — only an explicit Finish declaration can.
    expect(state.status).not.toBe("resolved");
    expect(state.values.requestRejectionRate).toBe(0.2);
    expect(state.values.configStatus).toBe("normal");
    expect(evaluateCandidateDeclaredFinish(badConfigurationRolloutSimulation, state).outcome).toBe(
      "resolved",
    );
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

    expect(state.status).not.toBe("resolved");
    expect(state.values.requestRejectionRate).toBe(0.2);
    expect(evaluateCandidateDeclaredFinish(badConfigurationRolloutSimulation, state).outcome).toBe(
      "resolved",
    );
  });

  it("stays active (never auto-fails) even after the request rejection rate remains critical past the old sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      badConfigurationRolloutSimulation.failureCondition.sustainedSeconds,
    );
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

  it("scores good (revert) > baseline (does nothing) > harmful (scale-to-8 without revert)", () => {
    // Baseline: no candidate actions at all. The incident never recovers
    // and stays critical — it no longer auto-fails via failureCondition,
    // but it also never resolves on its own.
    const baselineState = runScenario(30_000 + 61_000);
    // Harmful: scales API service instances to 8 without ever reverting
    // the bad config — wastes money and never fixes the actual problem,
    // so it must remain unresolved exactly like the baseline, only worse.
    const harmfulState = runScenario(30_000 + 61_000, [
      { atMs: 31_000, controlKey: API_SERVICE_INSTANCES_KEY, value: 8 },
    ]);
    // Good: reverts the bad config promptly.
    const goodState = runScenario(45_000, [
      { atMs: 31_000, controlKey: CONFIG_REVERT_ENABLED_KEY, value: true },
    ]);

    expect(baselineState.status).not.toBe("failed");
    expect(harmfulState.status).not.toBe("failed");
    expect(goodState.status).not.toBe("resolved");
    const goodFinish = evaluateCandidateDeclaredFinish(
      badConfigurationRolloutSimulation,
      goodState,
    );
    expect(goodFinish.outcome).toBe("resolved");

    const baselineScore = scoreAuthoredAttempt(
      BAD_CONFIGURATION_ROLLOUT_SCORING,
      extractScoringInputs(badConfigurationRolloutSimulation, baselineState),
    );
    const harmfulScore = scoreAuthoredAttempt(
      BAD_CONFIGURATION_ROLLOUT_SCORING,
      extractScoringInputs(badConfigurationRolloutSimulation, harmfulState),
    );
    const goodScore = scoreAuthoredAttempt(
      BAD_CONFIGURATION_ROLLOUT_SCORING,
      extractFinishScoringInputs(badConfigurationRolloutSimulation, goodFinish),
    );

    // The core regression: doing nothing must not be scored as flawlessly
    // cost/operationally efficient just because it took zero actions —
    // and actively wasting capacity without fixing the real problem must
    // score clearly worse than doing nothing.
    expect(harmfulScore.breakdown.costEfficiency).toBeLessThan(
      baselineScore.breakdown.costEfficiency,
    );
    expect(harmfulScore.breakdown.operationalEfficiency).toBeLessThan(
      baselineScore.breakdown.operationalEfficiency,
    );
    expect(harmfulScore.total).toBeLessThan(baselineScore.total);
    expect(baselineScore.total).toBeLessThan(goodScore.total);
  });
});
