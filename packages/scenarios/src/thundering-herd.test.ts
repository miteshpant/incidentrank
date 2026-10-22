import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { thunderingHerd } from "./thundering-herd";
import {
  API_GATEWAY_INSTANCES_KEY,
  CLIENT_JITTER_ENABLED_KEY,
  REQUEST_QUEUEING_ENABLED_KEY,
  thunderingHerdSimulation,
} from "./thundering-herd/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(thunderingHerdSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += thunderingHerdSimulation.tickMs
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
      thunderingHerdSimulation,
      state,
      action,
      thunderingHerdSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Thundering Herd", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(thunderingHerd.isFree).toBe(false);
    expect(thunderingHerd.library?.category).toBe("API & Traffic");
    expect(thunderingHerd.library?.tags.length).toBeGreaterThan(0);
    expect(thunderingHerd.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(thunderingHerdSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.requestsPerSecond).toBe(80);
    expect(state.values.gatewayStatus).toBe("normal");
  });

  it("is overwhelmed when the synchronized spike fires with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.rejectedRequestCount).toBe(900);
    expect(state.values.gatewayStatus).toBe("critical");
  });

  it("recovers cleanly when client jitter is enabled", () => {
    const state = runScenario(46_000, [
      { atMs: 31_000, controlKey: CLIENT_JITTER_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.rejectedRequestCount).toBe(0);
  });

  it("scaling the gateway without jitter survives the spike but never resolves — masked, not fixed", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: API_GATEWAY_INSTANCES_KEY, value: 32 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.gatewayStatus).toBe("warning");
    expect(state.values.rejectedRequestCount).toBe(40);
  });

  it("scaling the gateway without jitter is classified as harmful, while jitter is beneficial", () => {
    const withoutMitigation = runScenario(35_000);
    const withScaling = runScenario(35_000, [
      { atMs: 31_000, controlKey: API_GATEWAY_INSTANCES_KEY, value: 32 },
    ]);

    // Scaling alone reduces visible error symptoms relative to doing
    // nothing (that's what makes it a plausible-looking fix)...
    expect(withScaling.values.gatewayErrorRate).toBeLessThan(
      withoutMitigation.values.gatewayErrorRate as number,
    );
    // ...but it is still not a resolution.
    expect(withScaling.status).not.toBe("resolved");
  });

  it("request queueing alone softens visible errors but does not reduce underlying load", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: REQUEST_QUEUEING_ENABLED_KEY, value: true },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.requestsPerSecond).toBe(11_000);
    expect(state.values.gatewayStatus).toBe("warning");
  });

  it("fails if rejected requests stay critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak rejected requests generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.rejectedRequestCount).toBe(900);
  });

  it("tracks monthly infrastructure cost that increases with gateway instances", () => {
    let state = createInitialState(thunderingHerdSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(300);

    const tickMs = thunderingHerdSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-gateway",
      timestampMs: 0,
      controlKey: API_GATEWAY_INSTANCES_KEY,
      value: 32,
    };
    state = simulate(thunderingHerdSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(1_280);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: CLIENT_JITTER_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: REQUEST_QUEUEING_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
