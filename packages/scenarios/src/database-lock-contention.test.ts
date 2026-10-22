import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { databaseLockContention } from "./database-lock-contention";
import {
  BATCH_JOB_CHUNK_SIZE_KEY,
  BATCH_JOB_CONCURRENCY_KEY,
  databaseLockContentionSimulation,
  LOCK_TIMEOUT_MS_KEY,
} from "./database-lock-contention/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(databaseLockContentionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += databaseLockContentionSimulation.tickMs
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
      databaseLockContentionSimulation,
      state,
      action,
      databaseLockContentionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Database Lock Contention", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(databaseLockContention.isFree).toBe(false);
    expect(databaseLockContention.library?.category).toBe("Databases & Storage");
    expect(databaseLockContention.library?.tags.length).toBeGreaterThan(0);
    expect(databaseLockContention.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(databaseLockContentionSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.blockedTransactions).toBe(0);
    expect(state.values.lockStatus).toBe("normal");
  });

  it("contends critically when the batch job starts with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.blockedTransactions).toBe(180);
    expect(state.values.lockStatus).toBe("critical");
  });

  it("recovers cleanly with small batch chunks and low concurrency", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 100 },
      { atMs: 31_000, controlKey: BATCH_JOB_CONCURRENCY_KEY, value: 2 },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.blockedTransactions).toBe(2);
  });

  it("using a much larger chunk size to 'finish faster' is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithOversizedChunks = runScenario(35_000, [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 50_000 },
    ]);

    expect(stateWithOversizedChunks.values.blockedTransactions).toBeGreaterThan(
      stateWithoutMitigation.values.blockedTransactions as number,
    );
    expect(stateWithOversizedChunks.values.lockStatus).toBe("critical");
  });

  it("a very long lock timeout masks timeouts without fixing the underlying contention", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: LOCK_TIMEOUT_MS_KEY, value: 300_000 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.timedOutTransactions).toBe(0);
    expect(state.values.lockStatus).toBe("warning");
    expect(state.values.blockedTransactions).toBe(210);
  });

  it("reducing only the chunk size is a partial improvement", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 1_000 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.lockStatus).toBe("warning");
    expect(state.values.blockedTransactions).toBe(55);
  });

  it("escalates when a second concurrent batch job joins unmitigated", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.lockStatus).toBe("critical");
    expect(state.values.blockedTransactions).toBe(310);
  });

  it("fails if blocked transactions stay critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak blocked transactions generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.blockedTransactions).toBe(180);
  });

  it("tracks monthly infrastructure cost that increases with batch job concurrency", () => {
    let state = createInitialState(databaseLockContentionSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(100);

    const tickMs = databaseLockContentionSimulation.tickMs;
    const action: CandidateAction = {
      id: "raise-concurrency",
      timestampMs: 0,
      controlKey: BATCH_JOB_CONCURRENCY_KEY,
      value: 8,
    };
    state = simulate(databaseLockContentionSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(260);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 100 },
      { atMs: 31_000, controlKey: BATCH_JOB_CONCURRENCY_KEY, value: 2 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
