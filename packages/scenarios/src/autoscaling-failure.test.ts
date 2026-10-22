import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { autoscalingFailure } from "./autoscaling-failure";
import {
  autoscalingFailureSimulation,
  MAX_INSTANCE_COUNT_KEY,
  SCALE_UP_COOLDOWN_SECONDS_KEY,
  SCALE_UP_THRESHOLD_PERCENT_KEY,
} from "./autoscaling-failure/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(autoscalingFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += autoscalingFailureSimulation.tickMs
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
      autoscalingFailureSimulation,
      state,
      action,
      autoscalingFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Autoscaling Failure", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(autoscalingFailure.isFree).toBe(false);
    expect(autoscalingFailure.library?.category).toBe("Infrastructure & Capacity");
    expect(autoscalingFailure.library?.tags.length).toBeGreaterThan(0);
    expect(autoscalingFailure.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(autoscalingFailureSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.currentInstanceCount).toBe(4);
    expect(state.values.capacityStatus).toBe("normal");
  });

  it("becomes critically capped when traffic spikes with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.currentInstanceCount).toBe(4);
    expect(state.values.capacityStatus).toBe("critical");
  });

  it("recovers cleanly when the instance cap is raised to an adequate level", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 16 },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.currentInstanceCount).toBe(18);
  });

  it("tuning scale-up threshold and cooldown aggressively is ineffective while the cap stays low", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithAggressiveTuning = runScenario(35_000, [
      { atMs: 31_000, controlKey: SCALE_UP_THRESHOLD_PERCENT_KEY, value: 50 },
      { atMs: 31_000, controlKey: SCALE_UP_COOLDOWN_SECONDS_KEY, value: 30 },
    ]);

    // Instance count hits the exact same (unchanged) ceiling either way —
    // tuning reaction speed does nothing when the cap itself is the
    // binding constraint.
    expect(stateWithAggressiveTuning.values.currentInstanceCount).toBe(
      stateWithoutMitigation.values.currentInstanceCount,
    );
    expect(stateWithAggressiveTuning.values.capacityStatus).toBe("critical");
    expect(stateWithAggressiveTuning.values.cpuUtilizationPercent as number).toBeGreaterThan(90);
  });

  it("raising the cap moderately is only a partial improvement", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 8 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.capacityStatus).toBe("warning");
    expect(state.values.currentInstanceCount).toBe(8);
  });

  it("raising the cap moderately AND tuning reaction speed improves further than the cap alone", () => {
    const capOnly = runScenario(35_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 8 },
    ]);
    const capWithTuning = runScenario(35_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 8 },
      { atMs: 31_000, controlKey: SCALE_UP_THRESHOLD_PERCENT_KEY, value: 50 },
      { atMs: 31_000, controlKey: SCALE_UP_COOLDOWN_SECONDS_KEY, value: 30 },
    ]);

    expect(capWithTuning.values.cpuUtilizationPercent as number).toBeLessThan(
      capOnly.values.cpuUtilizationPercent as number,
    );
  });

  it("escalates when traffic surges further while still unmitigated", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.capacityStatus).toBe("critical");
    expect(state.values.cpuUtilizationPercent).toBe(99);
  });

  it("an adequate cap survives the further traffic surge", () => {
    const state = runScenario(5 * 60_000 + 30_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 16 },
    ]);

    expect(state.status).toBe("resolved");
  });

  it("fails if CPU utilization stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak request queue depth generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.requestQueueDepth).toBe(400);
  });

  it("tracks monthly infrastructure cost that increases with the instance cap", () => {
    let state = createInitialState(autoscalingFailureSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(200);

    const tickMs = autoscalingFailureSimulation.tickMs;
    const action: CandidateAction = {
      id: "raise-cap",
      timestampMs: 0,
      controlKey: MAX_INSTANCE_COUNT_KEY,
      value: 16,
    };
    state = simulate(autoscalingFailureSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(650);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 16 },
      { atMs: 31_000, controlKey: SCALE_UP_THRESHOLD_PERCENT_KEY, value: 70 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
