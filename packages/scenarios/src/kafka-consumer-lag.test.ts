import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { kafkaConsumerLag } from "./kafka-consumer-lag";
import {
  AUTO_COMMIT_ENABLED_KEY,
  CONSUMER_INSTANCES_KEY,
  kafkaConsumerLagSimulation,
  MAX_POLL_RECORDS_KEY,
} from "./kafka-consumer-lag/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(kafkaConsumerLagSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += kafkaConsumerLagSimulation.tickMs
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
      kafkaConsumerLagSimulation,
      state,
      action,
      kafkaConsumerLagSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Kafka Consumer Lag", () => {
  it("carries real library metadata and is one of the 3 free launch scenarios", () => {
    expect(kafkaConsumerLag.isFree).toBe(true);
    expect(kafkaConsumerLag.library?.category).toBe("Messaging & Streaming");
    expect(kafkaConsumerLag.library?.tags.length).toBeGreaterThan(0);
    expect(kafkaConsumerLag.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(kafkaConsumerLagSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.consumerLagMessages).toBe(200);
    expect(state.values.consumerStatus).toBe("normal");
  });

  it("lags critically when the producer spikes with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.consumerLagMessages).toBe(8_000);
    expect(state.values.consumerStatus).toBe("critical");
  });

  it("recovers when consumer instances are scaled up with auto-commit off", () => {
    const state = runScenario(55_000, [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.consumerLagMessages).toBe(150);
  });

  it("raising maxPollRecords once slow records appear is harmful, not helpful, even with many consumers", () => {
    const stateWithoutMitigation = runScenario(5 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
    ]);
    expect(stateWithoutMitigation.status).toBe("resolved");

    const stateWithHarmfulBatch = runScenario(5 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
      { atMs: 5 * 60_000 + 1_000, controlKey: MAX_POLL_RECORDS_KEY, value: 5_000 },
    ]);

    expect(stateWithHarmfulBatch.values.consumerLagMessages).toBeGreaterThan(
      stateWithoutMitigation.values.consumerLagMessages as number,
    );
    expect(stateWithHarmfulBatch.values.consumerStatus).toBe("critical");
  });

  it("scaling without disabling auto-commit drains lag but accrues dead-letter risk", () => {
    const state = runScenario(55_000, [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
      { atMs: 31_000, controlKey: AUTO_COMMIT_ENABLED_KEY, value: true },
    ]);

    expect(state.values.consumerLagMessages).toBe(300);
    expect(state.values.deadLetterCount).toBe(25);
    expect(state.values.consumerStatus).toBe("warning");
  });

  it("fails if lag stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak consumer lag generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.consumerLagMessages).toBe(8_000);
  });

  it("tracks monthly infrastructure cost that increases with consumer instances", () => {
    let state = createInitialState(kafkaConsumerLagSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(150);

    const tickMs = kafkaConsumerLagSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-consumers",
      timestampMs: 0,
      controlKey: CONSUMER_INSTANCES_KEY,
      value: 16,
    };
    state = simulate(kafkaConsumerLagSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(650);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
      { atMs: 31_000, controlKey: AUTO_COMMIT_ENABLED_KEY, value: false },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
