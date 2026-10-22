import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { consumerRebalanceStorm } from "./consumer-rebalance-storm";
import {
  consumerRebalanceStormSimulation,
  DEPLOY_STRATEGY_KEY,
  SESSION_TIMEOUT_MS_KEY,
  STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
} from "./consumer-rebalance-storm/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(consumerRebalanceStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += consumerRebalanceStormSimulation.tickMs
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
      consumerRebalanceStormSimulation,
      state,
      action,
      consumerRebalanceStormSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Consumer Rebalance Storm", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(consumerRebalanceStorm.isFree).toBe(false);
    expect(consumerRebalanceStorm.library?.category).toBe("Messaging & Streaming");
    expect(consumerRebalanceStorm.library?.tags.length).toBeGreaterThan(0);
    expect(consumerRebalanceStorm.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(consumerRebalanceStormSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.rebalanceCount).toBe(0);
    expect(state.values.groupStatus).toBe("normal");
  });

  it("enters a rebalance storm when the rolling deploy begins with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.effectiveThroughput).toBe(900);
    expect(state.values.groupStatus).toBe("critical");
  });

  it("recovers when static group membership is enabled", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.effectiveThroughput).toBe(3_900);
  });

  it("shortening the session timeout during a one-at-a-time deploy is harmful, not helpful", () => {
    const baseline = runScenario(35_000);
    const withShortTimeout = runScenario(35_000, [
      { atMs: 31_000, controlKey: SESSION_TIMEOUT_MS_KEY, value: 6_000 },
    ]);

    expect(withShortTimeout.values.rebalanceCount as number).toBeGreaterThan(
      baseline.values.rebalanceCount as number,
    );
    expect(withShortTimeout.values.effectiveThroughput as number).toBeLessThan(
      baseline.values.effectiveThroughput as number,
    );
    expect(withShortTimeout.values.groupStatus).toBe("critical");
  });

  it("static group membership dominates over a short timeout (recovery, not the trap)", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: SESSION_TIMEOUT_MS_KEY, value: 6_000 },
      { atMs: 31_000, controlKey: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.groupStatus).toBe("normal");
  });

  it("a non-rolling deploy strategy alone is a partial, not full, improvement", () => {
    const blueGreen = runScenario(35_000, [
      { atMs: 31_000, controlKey: DEPLOY_STRATEGY_KEY, value: "blue-green" },
    ]);

    expect(blueGreen.values.groupStatus).toBe("warning");
    expect(blueGreen.values.effectiveThroughput).toBe(3_200);
  });

  it("escalates when the health check also starts flapping", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.groupStatus).toBe("critical");
    expect(state.values.rebalanceCount).toBe(38);
  });

  it("fails if effective throughput stays critically low for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak rebalance count generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.rebalanceCount).toBe(24);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
