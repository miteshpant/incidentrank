import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import {
  dbConnectionSaturationSimulation,
  POOL_SIZE_KEY,
  READ_REPLICA_ENABLED_KEY,
} from "./db-connection-saturation/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(dbConnectionSaturationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += dbConnectionSaturationSimulation.tickMs
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
      dbConnectionSaturationSimulation,
      state,
      action,
      dbConnectionSaturationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

/**
 * Genericity proof (originally Phase 5's engine-generalization mandate,
 * preserved through the Phase 6 promotion to a launch scenario — see
 * docs/implementation_plan/phase6.md): this scenario's state keys
 * (connectionUsage, requestLatencyMs, errorRate, dbStatus) share nothing
 * with Payment Retry Storm's domain, and run entirely as authored data
 * through the same generic simulator — no new engine code. These tests
 * remain the proof that the engine is scenario-agnostic; see
 * db-connection-saturation-launch.test.ts for candidate-facing launch
 * coverage (richer architecture, batch-job escalation, harmful-timeout
 * path, cost tracking) added when this scenario was promoted.
 */
describe("Database Connection Saturation — genericity proof", () => {
  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(dbConnectionSaturationSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.connectionUsage).toBe(40);
    expect(state.values.dbStatus).toBe("normal");
    expect(state.incidentStartedAtMs).toBeNull();
  });

  it("saturates when the pool is too small to absorb the spike", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.connectionUsage).toBe(98);
    expect(state.values.dbStatus).toBe("critical");
  });

  it("recovers when the pool is scaled and the read replica is enabled", () => {
    const state = runScenario(60_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
      { atMs: 31_000, controlKey: READ_REPLICA_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.resolvedAtMs).not.toBeNull();
  });

  it("only partially improves when the pool is scaled without the read replica", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
    ]);

    expect(state.status).toBe("degraded");
    expect(state.values.dbStatus).toBe("warning");
  });

  it("fails if error rate stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak connection usage generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.connectionUsage).toBe(98);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
      { atMs: 31_000, controlKey: READ_REPLICA_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
