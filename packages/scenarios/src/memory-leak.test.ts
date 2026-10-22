import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { memoryLeak } from "./memory-leak";
import {
  CACHE_EVICTION_POLICY_ENABLED_KEY,
  MANUAL_RESTART_TRIGGERED_KEY,
  memoryLeakSimulation,
  MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
} from "./memory-leak/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(memoryLeakSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += memoryLeakSimulation.tickMs
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
      memoryLeakSimulation,
      state,
      action,
      memoryLeakSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Memory Leak", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(memoryLeak.isFree).toBe(false);
    expect(memoryLeak.library?.category).toBe("Infrastructure & Capacity");
    expect(memoryLeak.library?.tags.length).toBeGreaterThan(0);
    expect(memoryLeak.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(memoryLeakSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.memoryUsageMb).toBe(400);
    expect(state.values.serviceStatus).toBe("normal");
  });

  it("climbs to critical when the leak starts with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.memoryUsageMb).toBe(2_600);
    expect(state.values.serviceStatus).toBe("critical");
  });

  it("recovers durably when the memory-limit auto-restart policy is enabled", () => {
    const state = runScenario(46_000, [
      { atMs: 31_000, controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.memoryUsageMb).toBe(420);
  });

  it("a one-time manual restart alone looks fine at first but is not durable once the leak recurs", () => {
    const beforeRecurrence = runScenario(31_000 + 10_000, [
      { atMs: 31_000, controlKey: MANUAL_RESTART_TRIGGERED_KEY, value: true },
    ]);
    expect(beforeRecurrence.values.memoryUsageMb).toBe(420);
    expect(beforeRecurrence.values.serviceStatus).toBe("normal");

    const afterRecurrence = runScenario(5 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: MANUAL_RESTART_TRIGGERED_KEY, value: true },
    ]);
    expect(afterRecurrence.values.memoryUsageMb).toBe(3_800);
    expect(afterRecurrence.values.serviceStatus).toBe("critical");
  });

  it("enabling the auto-restart policy survives the leak recurring, unlike a manual restart alone", () => {
    const state = runScenario(5 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: MANUAL_RESTART_TRIGGERED_KEY, value: true },
      { atMs: 31_000, controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY, value: true },
    ]);

    expect(state.values.memoryUsageMb).toBe(420);
    expect(state.values.serviceStatus).toBe("normal");
  });

  it("cache eviction alone slows but does not fully stop the climb", () => {
    const state = runScenario(31_000 + 10_000, [
      { atMs: 31_000, controlKey: CACHE_EVICTION_POLICY_ENABLED_KEY, value: true },
    ]);

    expect(state.values.memoryUsageMb).toBe(1_800);
    expect(state.values.serviceStatus).toBe("warning");
  });

  it("fails if memory stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak memory usage generically via numericWatchFields", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.peaks.peakValues.memoryUsageMb).toBe(3_800);
  });

  it("tracks monthly infrastructure cost that increases with the auto-restart policy", () => {
    let state = createInitialState(memoryLeakSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(80);

    const tickMs = memoryLeakSimulation.tickMs;
    const action: CandidateAction = {
      id: "enable-auto-restart",
      timestampMs: 0,
      controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
      value: true,
    };
    state = simulate(memoryLeakSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(95);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
