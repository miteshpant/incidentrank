import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { readReplicaLag } from "./read-replica-lag";
import {
  READ_ROUTING_MODE_KEY,
  readReplicaLagSimulation,
  REPLICATION_BATCH_SIZE_KEY,
  WRITE_THROTTLE_ENABLED_KEY,
} from "./read-replica-lag/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(readReplicaLagSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += readReplicaLagSimulation.tickMs
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
      readReplicaLagSimulation,
      state,
      action,
      readReplicaLagSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Read Replica Lag", () => {
  it("carries real library metadata and is a paid scenario", () => {
    expect(readReplicaLag.isFree).toBe(false);
    expect(readReplicaLag.library?.category).toBe("Databases & Storage");
    expect(readReplicaLag.library?.tags.length).toBeGreaterThan(0);
    expect(readReplicaLag.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(readReplicaLagSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.replicationLagMs).toBe(80);
    expect(state.values.replicaStatus).toBe("normal");
  });

  it("lags critically when a write burst hits with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.replicationLagMs).toBe(8_000);
    expect(state.values.replicaStatus).toBe("critical");
  });

  it("recovers when reads are routed to the primary for recent writes", () => {
    const state = runScenario(55_000, [
      {
        atMs: 31_000,
        controlKey: READ_ROUTING_MODE_KEY,
        value: "primary-for-recent-writes",
      },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.replicationLagMs).toBe(120);
  });

  it("routing everything to the primary is harmful, not helpful", () => {
    const baseline = runScenario(35_000);
    const withAlwaysPrimary = runScenario(35_000, [
      { atMs: 31_000, controlKey: READ_ROUTING_MODE_KEY, value: "always-primary" },
    ]);

    expect(withAlwaysPrimary.values.writeLatencyMs).toBeGreaterThan(
      baseline.values.writeLatencyMs as number,
    );
    expect(withAlwaysPrimary.values.replicaStatus).toBe("critical");
  });

  it("routing everything to the primary and throttling writes masks the symptom at a throughput cost", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: READ_ROUTING_MODE_KEY, value: "always-primary" },
      { atMs: 31_000, controlKey: WRITE_THROTTLE_ENABLED_KEY, value: true },
    ]);

    expect(state.values.replicaStatus).toBe("warning");
    expect(state.values.replicationLagMs).toBe(4_000);
  });

  it("a smaller replication batch size alone only partially helps", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: REPLICATION_BATCH_SIZE_KEY, value: "small" },
    ]);

    expect(state.values.replicaStatus).toBe("warning");
    expect(state.values.replicationLagMs).toBe(2_200);
  });

  it("fails if lag stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak replication lag generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.replicationLagMs).toBe(8_000);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      {
        atMs: 31_000,
        controlKey: READ_ROUTING_MODE_KEY,
        value: "primary-for-recent-writes",
      },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
