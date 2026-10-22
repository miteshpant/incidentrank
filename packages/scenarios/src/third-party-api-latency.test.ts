import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { thirdPartyApiLatency } from "./third-party-api-latency";
import {
  API_TIMEOUT_MS_KEY,
  ASYNC_PROCESSING_ENABLED_KEY,
  CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
  thirdPartyApiLatencySimulation,
} from "./third-party-api-latency/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(thirdPartyApiLatencySimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += thirdPartyApiLatencySimulation.tickMs
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
      thirdPartyApiLatencySimulation,
      state,
      action,
      thirdPartyApiLatencySimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Third-Party API Latency", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(thirdPartyApiLatency.isFree).toBe(false);
    expect(thirdPartyApiLatency.library?.category).toBe("API & Traffic");
    expect(thirdPartyApiLatency.library?.tags.length).toBeGreaterThan(0);
    expect(thirdPartyApiLatency.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(thirdPartyApiLatencySimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.thirdPartyResponseTimeMs).toBe(180);
    expect(state.values.checkoutStatus).toBe("normal");
  });

  it("degrades checkout critically when the vendor slows down with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.checkoutServiceThreadPoolUtilization).toBe(85);
    expect(state.values.checkoutStatus).toBe("critical");
  });

  it("recovers when the timeout is shortened and cached fallback is enabled", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 500 },
      { atMs: 31_000, controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.checkoutServiceThreadPoolUtilization).toBe(28);
  });

  it("recovers even better with async processing added on top", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 500 },
      { atMs: 31_000, controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: ASYNC_PROCESSING_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.checkoutServiceThreadPoolUtilization).toBe(18);
  });

  it("lengthening the timeout while the vendor is slow is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithLongerTimeout = runScenario(35_000, [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 20_000 },
    ]);

    expect(stateWithLongerTimeout.values.checkoutServiceThreadPoolUtilization).toBeGreaterThan(
      stateWithoutMitigation.values.checkoutServiceThreadPoolUtilization as number,
    );
    expect(stateWithLongerTimeout.values.checkoutStatus).toBe("critical");
  });

  it("shortening the timeout alone without enabling fallback only partially helps", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 500 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.checkoutStatus).toBe("warning");
    expect(state.values.checkoutServiceThreadPoolUtilization).toBe(55);
    expect(state.values.cacheFallbackHitRate).toBe(0);
  });

  it("fails if checkout thread pool stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak checkout thread pool utilization generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.checkoutServiceThreadPoolUtilization).toBe(85);
  });

  it("tracks monthly infrastructure cost that increases when cached fallback is enabled", () => {
    let state = createInitialState(thirdPartyApiLatencySimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(80);

    const tickMs = thirdPartyApiLatencySimulation.tickMs;
    const action: CandidateAction = {
      id: "enable-fallback",
      timestampMs: 0,
      controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
      value: true,
    };
    state = simulate(thirdPartyApiLatencySimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(120);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 500 },
      { atMs: 31_000, controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
