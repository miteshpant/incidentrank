import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { authenticationServiceDegradation } from "./authentication-service-degradation";
import {
  AUTH_SERVICE_INSTANCES_KEY,
  authenticationServiceDegradationSimulation,
  SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
  TOKEN_CACHE_TTL_SECONDS_KEY,
} from "./authentication-service-degradation/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(authenticationServiceDegradationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += authenticationServiceDegradationSimulation.tickMs
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
      authenticationServiceDegradationSimulation,
      state,
      action,
      authenticationServiceDegradationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Authentication Service Degradation", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(authenticationServiceDegradation.isFree).toBe(false);
    expect(authenticationServiceDegradation.library?.category).toBe("Security & Identity");
    expect(authenticationServiceDegradation.library?.tags.length).toBeGreaterThan(0);
    expect(authenticationServiceDegradation.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(authenticationServiceDegradationSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.authServiceLatencyMs).toBe(40);
    expect(state.values.authServiceStatus).toBe("normal");
  });

  it("degrades critically when the trigger fires with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.authFailureRate).toBe(18);
    expect(state.values.authServiceStatus).toBe("critical");
  });

  it("recovers cleanly by scaling auth service capacity", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: AUTH_SERVICE_INSTANCES_KEY, value: 16 },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.authFailureRate).toBe(0.2);
  });

  it("bypassing signature verification makes metrics look healthy while the incidentState reflects a security regression, never recovery", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY, value: true },
    ]);

    // The trap: failure rate and latency look GOOD.
    expect(state.values.authFailureRate).toBe(0.05);
    expect(state.values.authServiceLatencyMs).toBe(20);
    // But the engine never treats this as resolved/recovering.
    expect(state.status).not.toBe("resolved");
    expect(state.values.authServiceStatus).toBe("critical");
  });

  it("classifies the signature bypass as a harmful action even though it is not classified as a failure by the engine", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY, value: true },
    ]);

    expect(state.numberOfHarmfulChanges).toBe(1);
  });

  it("partial scaling alone is a real but incomplete improvement", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: AUTH_SERVICE_INSTANCES_KEY, value: 4 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.authServiceStatus).toBe("warning");
    expect(state.values.authFailureRate).toBe(4);
  });

  it("extending the cache TTL alone relieves load but doesn't address root capacity", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: TOKEN_CACHE_TTL_SECONDS_KEY, value: 300 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.authServiceStatus).toBe("warning");
    expect(state.values.authFailureRate).toBe(6);
  });

  it("escalates when cache hit rate degrades further unmitigated", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.authServiceStatus).toBe("critical");
    expect(state.values.authFailureRate).toBe(28);
  });

  it("fails if the failure rate stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak auth failure rate generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.authFailureRate).toBe(18);
  });

  it("tracks monthly infrastructure cost that increases with auth service instances", () => {
    let state = createInitialState(authenticationServiceDegradationSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(300);

    const tickMs = authenticationServiceDegradationSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-instances",
      timestampMs: 0,
      controlKey: AUTH_SERVICE_INSTANCES_KEY,
      value: 16,
    };
    state = simulate(authenticationServiceDegradationSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(1_080);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: AUTH_SERVICE_INSTANCES_KEY, value: 16 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
