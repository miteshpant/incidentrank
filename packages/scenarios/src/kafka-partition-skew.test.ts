import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { kafkaPartitionSkew } from "./kafka-partition-skew";
import {
  CONSUMER_INSTANCES_KEY,
  kafkaPartitionSkewSimulation,
  PARTITION_COUNT_KEY,
  PARTITION_KEY_STRATEGY_KEY,
} from "./kafka-partition-skew/definition";
import { KAFKA_PARTITION_SKEW_SCORING } from "./kafka-partition-skew/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(kafkaPartitionSkewSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += kafkaPartitionSkewSimulation.tickMs
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
      kafkaPartitionSkewSimulation,
      state,
      action,
      kafkaPartitionSkewSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Kafka Partition Skew", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(kafkaPartitionSkew.isFree).toBe(false);
    expect(kafkaPartitionSkew.library?.category).toBe("Messaging & Streaming");
    expect(kafkaPartitionSkew.library?.tags.length).toBeGreaterThan(0);
    expect(kafkaPartitionSkew.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(kafkaPartitionSkewSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.hotPartitionLagMessages).toBe(150);
    expect(state.values.partitionStatus).toBe("normal");
    expect(state.values.orderingMode).toBe("preserved");
  });

  it("the hot partition becomes critical while aggregate utilization still looks moderate", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.hotPartitionLagMessages).toBe(7_000);
    expect(state.values.partitionStatus).toBe("critical");
    // The misleading signal: aggregate utilization alone would not look
    // like an obvious emergency.
    expect(state.values.aggregateConsumerUtilization).toBeLessThan(50);
  });

  it("scaling consumer instances alone does NOT fix the hot partition, even heavily scaled, and wastes cost on idle consumers", () => {
    const baseline = runScenario(35_000);
    const scaledButStillSkewed = runScenario(35_000, [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
    ]);

    expect(scaledButStillSkewed.values.hotPartitionLagMessages).toBeGreaterThanOrEqual(
      baseline.values.hotPartitionLagMessages as number,
    );
    expect(scaledButStillSkewed.values.partitionStatus).toBe("critical");
    expect(scaledButStillSkewed.values.idleConsumerCount).toBeGreaterThan(0);
  });

  it("reaches a sustained healthy state when the hot key is salted and enough partitions exist (Phase 6.1: candidate_declared, never auto-resolves)", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "tenant-id-salted" },
      { atMs: 31_000, controlKey: PARTITION_COUNT_KEY, value: 8 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.resolvedAtMs).toBeNull();
    expect(state.values.hotPartitionLagMessages).toBe(80);
    expect(state.values.idleConsumerCount).toBe(0);
    expect(state.values.orderingMode).toBe("preserved");
    expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
      kafkaPartitionSkewSimulation.successCondition.sustainedSeconds,
    );
  });

  it("round-robin keying also drains the hot-partition lag but carries an ordering tradeoff", () => {
    const state = runScenario(45_000, [
      { atMs: 31_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "round-robin" },
    ]);

    expect(state.values.hotPartitionLagMessages).toBe(120);
    expect(state.values.partitionStatus).toBe("warning");
    expect(state.values.orderingMode).toBe("degraded");
    expect(state.status).not.toBe("critical");
  });

  describe("Phase 6.1: two-tier completion — salted-key (optimal) vs round-robin (acceptable, ordering tradeoff)", () => {
    it("salted key with enough partitions, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(50_000, [
        { atMs: 31_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "tenant-id-salted" },
        { atMs: 31_000, controlKey: PARTITION_COUNT_KEY, value: 8 },
      ]);

      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(kafkaPartitionSkewSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("round-robin, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate resolution, not a trap", () => {
      const state = runScenario(50_000, [
        { atMs: 31_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "round-robin" },
      ]);

      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(kafkaPartitionSkewSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("more-partitions-still-skewed (unsalted) remains ineligible for any Finish tier — throughput never actually recovers", () => {
      const state = runScenario(50_000, [
        { atMs: 31_000, controlKey: PARTITION_COUNT_KEY, value: 16 },
      ]);

      expect(state.status).not.toBe("resolved");
      expect(state.values.hotPartitionLagMessages).toBe(6_000);
      const eligibility = evaluateCompletionEligibility(kafkaPartitionSkewSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("both salted-key and round-robin remain resolved via Finish, but salted-key scores higher on dataIntegrity (the intended dimension)", () => {
      const saltedKey = runScenario(50_000, [
        { atMs: 31_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "tenant-id-salted" },
        { atMs: 31_000, controlKey: PARTITION_COUNT_KEY, value: 8 },
      ]);
      const roundRobin = runScenario(50_000, [
        { atMs: 31_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "round-robin" },
      ]);

      const saltedKeyFinish = evaluateCandidateDeclaredFinish(kafkaPartitionSkewSimulation, saltedKey);
      const roundRobinFinish = evaluateCandidateDeclaredFinish(kafkaPartitionSkewSimulation, roundRobin);

      // Both are genuinely resolved — round-robin is a legitimate
      // accepted tradeoff, never a trap that silently fails Finish.
      expect(saltedKeyFinish.outcome).toBe("resolved");
      expect(saltedKeyFinish.completionTier).toBe("optimal");
      expect(roundRobinFinish.outcome).toBe("resolved");
      expect(roundRobinFinish.completionTier).toBe("acceptable");

      const saltedKeyScore = scoreAuthoredAttempt(
        KAFKA_PARTITION_SKEW_SCORING,
        extractFinishScoringInputs(kafkaPartitionSkewSimulation, saltedKeyFinish),
      );
      const roundRobinScore = scoreAuthoredAttempt(
        KAFKA_PARTITION_SKEW_SCORING,
        extractFinishScoringInputs(kafkaPartitionSkewSimulation, roundRobinFinish),
      );

      expect(saltedKeyScore.breakdown.dataIntegrity).toBeGreaterThan(
        roundRobinScore.breakdown.dataIntegrity,
      );
    });
  });

  it("salting the key without enough partitions is only a partial improvement", () => {
    const state = runScenario(45_000, [
      { atMs: 31_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "tenant-id-salted" },
    ]);

    expect(state.values.hotPartitionLagMessages).toBe(1_800);
    expect(state.status).not.toBe("resolved");
  });

  it("stays active (never auto-fails) even after hot-partition lag remains critical past the old sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      kafkaPartitionSkewSimulation.failureCondition.sustainedSeconds,
    );
  });

  it("tracks peak hot-partition lag generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.hotPartitionLagMessages).toBe(7_000);
  });

  it("tracks monthly infrastructure cost that increases with both consumer instances and partition count", () => {
    let state = createInitialState(kafkaPartitionSkewSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(100);

    const tickMs = kafkaPartitionSkewSimulation.tickMs;
    state = simulate(
      kafkaPartitionSkewSimulation,
      state,
      { id: "scale-consumers", timestampMs: 0, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
      tickMs,
    ).state;
    state = simulate(
      kafkaPartitionSkewSimulation,
      state,
      { id: "scale-partitions", timestampMs: tickMs, controlKey: PARTITION_COUNT_KEY, value: 32 },
      tickMs,
    ).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(100 + 380 + 150);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "tenant-id-salted" },
      { atMs: 31_000, controlKey: PARTITION_COUNT_KEY, value: 8 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
