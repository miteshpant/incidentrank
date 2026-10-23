import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { eventProcessingBackpressure } from "./event-processing-backpressure";
import {
  CONSUMER_COUNT_KEY,
  eventProcessingBackpressureSimulation,
  EXTERNAL_API_CALL_CONCURRENCY_KEY,
  PRIORITY_ROUTING_ENABLED_KEY,
  PRODUCER_THROTTLE_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./event-processing-backpressure/definition";
import { eventProcessingBackpressureCandidateUI } from "./event-processing-backpressure/candidate-ui";
import { EVENT_PROCESSING_BACKPRESSURE_SCORING } from "./event-processing-backpressure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(eventProcessingBackpressureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += eventProcessingBackpressureSimulation.tickMs
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
      eventProcessingBackpressureSimulation,
      state,
      action,
      eventProcessingBackpressureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const PRODUCER_SURGE_MS = 30_000;

describe("Event Processing Backpressure", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(eventProcessingBackpressure.isFree).toBe(false);
      expect(eventProcessingBackpressure.library?.category).toBe("Messaging & Streaming");
      expect(eventProcessingBackpressure.library?.tags.length).toBeGreaterThan(0);
      expect(eventProcessingBackpressure.library?.skills.length).toBeGreaterThan(0);
      expect(eventProcessingBackpressure.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = EVENT_PROCESSING_BACKPRESSURE_SCORING.dimensions.map((d) => d.dimension);
      expect(dims.sort()).toEqual(
        [
          "recovery",
          "customerImpact",
          "dataIntegrity",
          "reliability",
          "costEfficiency",
          "operationalEfficiency",
        ].sort(),
      );
      const totalMax = EVENT_PROCESSING_BACKPRESSURE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(eventProcessingBackpressureCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(eventProcessingBackpressureCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(eventProcessingBackpressureCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(eventProcessingBackpressureSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.kafkaLagMessages).toBe(400);
      expect(state.values.downstreamPressure).toBe("unresolved");
    });

    it("producer surge triggers the backlog-growing baseline incident", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(PRODUCER_SURGE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.kafkaLagMessages).toBe(12_000);
      expect(state.values.eventFreshnessSeconds).toBe(150);
      expect(state.values.kafkaStatus).toBe("critical");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.kafkaStatus).toBe("critical");
    });

    it("strong/optimal path: scaling consumers with priority routing and capped external concurrency balances every subsystem", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
      ]);
      expect(state.values.kafkaLagMessages).toBe(20);
      expect(state.values.eventFreshnessSeconds).toBe(2);
      expect(state.values.dbConnectionUtilization).toBe(42);
      expect(state.values.externalApiErrorRate).toBe(2);
      expect(state.values.downstreamPressure).toBe("balanced");
    });

    it("pressure-transfer: scaling consumers/workers alone drains Kafka but overloads the database", () => {
      const baseline = runScenario(PRODUCER_SURGE_MS + 20_000);
      const scaled = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 40 },
      ]);

      // Primary symptom relieved: Kafka lag and freshness both improve
      // relative to baseline...
      expect(scaled.values.kafkaLagMessages).toBeLessThan(baseline.values.kafkaLagMessages as number);
      expect(scaled.values.eventFreshnessSeconds).toBeLessThan(
        baseline.values.eventFreshnessSeconds as number,
      );
      // ...but the secondary subsystem (database) is now visibly, directly
      // constrained as a consequence of the same mitigation.
      expect(scaled.values.dbConnectionUtilization).toBe(96);
      expect(scaled.values.dbConnectionUtilization).toBeGreaterThan(
        baseline.values.dbConnectionUtilization as number,
      );
      expect(scaled.values.downstreamPressure).toBe("database-overloaded");
    });

    it("pressure-transfer: scaling consumers with high external-call concurrency drains Kafka but overloads the external API", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        {
          atMs: PRODUCER_SURGE_MS + 1_000,
          controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
          value: 60,
        },
      ]);
      expect(state.values.kafkaLagMessages).toBe(30);
      expect(state.values.externalApiErrorRate).toBe(48);
      expect(state.values.downstreamPressure).toBe("external-api-overloaded");
    });

    it("harmful: pushing every concurrency lever at once overloads both the database and external API simultaneously", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 16 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 80 },
        {
          atMs: PRODUCER_SURGE_MS + 1_000,
          controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
          value: 60,
        },
      ]);
      expect(state.values.dbConnectionUtilization).toBe(97);
      expect(state.values.externalApiErrorRate).toBe(42);
      expect(state.values.downstreamPressure).toBe("database-overloaded");
    });

    it("masking path: producer throttle alone stops nothing from draining faster, so freshness stays stale", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRODUCER_THROTTLE_ENABLED_KEY, value: true },
      ]);
      expect(state.values.eventFreshnessSeconds).toBe(70);
      expect(state.values.kafkaStatus).toBe("warning");
      expect(state.values.downstreamPressure).toBe("unresolved");
    });

    it("acceptable path: priority routing with consumers scaled protects the core path and every subsystem, deferring low-priority freshness", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
        {
          atMs: PRODUCER_SURGE_MS + 1_000,
          controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
          value: 60,
        },
      ]);
      expect(state.values.dbConnectionUtilization).toBe(55);
      expect(state.values.externalApiErrorRate).toBe(6);
      expect(state.values.downstreamPressure).toBe("low-priority-deferred");
    });

    it("delayed consequence: sustained unmanaged external-call volume trips the external API's own rate limiter on a second wave, with a visible precursor beforehand", () => {
      const beforeSecondWave = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        {
          atMs: PRODUCER_SURGE_MS + 1_000,
          controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
          value: 60,
        },
      ]);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.externalApiErrorRate).toBeGreaterThanOrEqual(25);

      const afterSecondWave = runScenario(PRODUCER_SURGE_MS + 3 * 60_000 + 5_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        {
          atMs: PRODUCER_SURGE_MS + 1_000,
          controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
          value: 60,
        },
      ]);
      expect(afterSecondWave.values.externalApiErrorRate).toBe(65);
      expect(afterSecondWave.values.kafkaStatus).toBe("critical");
      expect(afterSecondWave.values.downstreamPressure).toBe("external-api-overloaded");
    });

    it("fails if database connection utilization stays at or above 95% for the full sustained window", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000 + 61_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 40 },
      ]);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak Kafka lag and peak DB connection utilization generically via numericWatchFields", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 1_000);
      expect(state.peaks.peakValues.kafkaLagMessages).toBe(12_000);
    });

    it("tracks monthly infrastructure cost that increases with consumer count, worker concurrency, and external-call concurrency", () => {
      let state = createInitialState(eventProcessingBackpressureSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);

      const tickMs = eventProcessingBackpressureSimulation.tickMs;
      state = simulate(
        eventProcessingBackpressureSimulation,
        state,
        { id: "scale-consumers", timestampMs: 0, controlKey: CONSUMER_COUNT_KEY, value: 16 },
        tickMs,
      ).state;
      state = simulate(
        eventProcessingBackpressureSimulation,
        state,
        { id: "scale-workers", timestampMs: tickMs, controlKey: WORKER_CONCURRENCY_KEY, value: 80 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 880 + 480);
    });
  });

  describe("Phase 6.1: two-tier completion — balanced (optimal) vs priority-routed (acceptable)", () => {
    it("balanced, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(eventProcessingBackpressureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("priority-routed with consumers scaled, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
        {
          atMs: PRODUCER_SURGE_MS + 1_000,
          controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
          value: 60,
        },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(eventProcessingBackpressureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("database-overloaded pressure-transfer remains ineligible for any Finish tier despite drained Kafka lag", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 40 },
      ]);
      expect(state.values.kafkaLagMessages).toBeLessThanOrEqual(50);
      const eligibility = evaluateCompletionEligibility(eventProcessingBackpressureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        eventProcessingBackpressureSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
        {
          atMs: PRODUCER_SURGE_MS + 1_000,
          controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
          value: 60,
        },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        eventProcessingBackpressureSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(eventProcessingBackpressureSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
        {
          atMs: PRODUCER_SURGE_MS + 1_000,
          controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
          value: 60,
        },
      ]);
      const result = evaluateCandidateDeclaredFinish(eventProcessingBackpressureSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (database-overloaded pressure-transfer) -> declared_unstable", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 40 },
      ]);
      const result = evaluateCandidateDeclaredFinish(eventProcessingBackpressureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(eventProcessingBackpressureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(PRODUCER_SURGE_MS + 20_000 + 61_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 40 },
      ]);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(eventProcessingBackpressureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
      ];
      const runA = runScenario(PRODUCER_SURGE_MS + 20_000, actions);
      const runB = runScenario(PRODUCER_SURGE_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical scored totals for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
      ];
      const stateA = runScenario(PRODUCER_SURGE_MS + 20_000, actions);
      const stateB = runScenario(PRODUCER_SURGE_MS + 20_000, actions);
      const finishA = evaluateCandidateDeclaredFinish(eventProcessingBackpressureSimulation, stateA);
      const finishB = evaluateCandidateDeclaredFinish(eventProcessingBackpressureSimulation, stateB);
      const scoreA = scoreAuthoredAttempt(
        EVENT_PROCESSING_BACKPRESSURE_SCORING,
        extractFinishScoringInputs(eventProcessingBackpressureSimulation, finishA),
      );
      const scoreB = scoreAuthoredAttempt(
        EVENT_PROCESSING_BACKPRESSURE_SCORING,
        extractFinishScoringInputs(eventProcessingBackpressureSimulation, finishB),
      );
      expect(scoreA).toEqual(scoreB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal (balanced), acceptable (priority-routed), baseline, and harmful (db-overloaded) paths with coherent ordering", () => {
      const optimalState = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
      ]);
      const optimalFinish = evaluateCandidateDeclaredFinish(
        eventProcessingBackpressureSimulation,
        optimalState,
      );
      const optimalScore = scoreAuthoredAttempt(
        EVENT_PROCESSING_BACKPRESSURE_SCORING,
        extractFinishScoringInputs(eventProcessingBackpressureSimulation, optimalFinish),
      );

      const acceptableState = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
        {
          atMs: PRODUCER_SURGE_MS + 1_000,
          controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
          value: 60,
        },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        eventProcessingBackpressureSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        EVENT_PROCESSING_BACKPRESSURE_SCORING,
        extractFinishScoringInputs(eventProcessingBackpressureSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(PRODUCER_SURGE_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        EVENT_PROCESSING_BACKPRESSURE_SCORING,
        extractScoringInputs(eventProcessingBackpressureSimulation, baselineState),
      );

      const harmfulState = runScenario(PRODUCER_SURGE_MS + 20_000, [
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
        { atMs: PRODUCER_SURGE_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 40 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        EVENT_PROCESSING_BACKPRESSURE_SCORING,
        extractScoringInputs(eventProcessingBackpressureSimulation, harmfulState),
      );

      expect(optimalScore.total).toBe(820);
      expect(acceptableScore.total).toBe(775);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBe(300);

      expect(optimalScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(harmfulScore.total);
    });
  });
});
