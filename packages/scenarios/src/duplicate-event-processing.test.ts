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
import { duplicateEventProcessing } from "./duplicate-event-processing";
import {
  ACK_TIMEOUT_MS_KEY,
  CONSUMER_CONCURRENCY_KEY,
  DEDUPLICATION_WINDOW_SECONDS_KEY,
  duplicateEventProcessingSimulation,
  IDEMPOTENT_PROCESSING_ENABLED_KEY,
} from "./duplicate-event-processing/definition";
import { duplicateEventProcessingCandidateUI } from "./duplicate-event-processing/candidate-ui";
import { DUPLICATE_EVENT_PROCESSING_SCORING } from "./duplicate-event-processing/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(duplicateEventProcessingSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += duplicateEventProcessingSimulation.tickMs
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
      duplicateEventProcessingSimulation,
      state,
      action,
      duplicateEventProcessingSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const ACK_FAILURES_BEGIN_MS = 30_000;
const SUSTAINED_REDELIVERY_MS = ACK_FAILURES_BEGIN_MS + 3 * 60_000;

describe("Duplicate Event Processing", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(duplicateEventProcessing.isFree).toBe(false);
      expect(duplicateEventProcessing.library?.category).toBe("Messaging & Streaming");
      expect(duplicateEventProcessing.library?.tags.length).toBeGreaterThan(0);
      expect(duplicateEventProcessing.library?.skills.length).toBeGreaterThan(0);
      expect(duplicateEventProcessing.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = DUPLICATE_EVENT_PROCESSING_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = DUPLICATE_EVENT_PROCESSING_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(duplicateEventProcessingCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(duplicateEventProcessingCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(duplicateEventProcessingCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(duplicateEventProcessingSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.duplicateOrderCount).toBe(0);
      expect(state.values.duplicateSafetyStatus).toBe("unresolved");
    });

    it("ack failures trigger the redelivering baseline incident (degraded, escalating to critical on the second wave)", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(ACK_FAILURES_BEGIN_MS);
      expect(state.status).toBe("degraded");
      expect(state.values.duplicateOrderCount).toBe(60);
      expect(state.values.duplicatePaymentCount).toBe(42);
      expect(state.values.duplicateSafetyStatus).toBe("unsafe-duplicating");
    });

    it("strong path: idempotent processing WITH a real dedup window holds duplicates at zero", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 25_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY, value: true },
        { atMs: ACK_FAILURES_BEGIN_MS + 2_000, controlKey: DEDUPLICATION_WINDOW_SECONDS_KEY, value: 120 },
      ]);
      expect(state.values.duplicateOrderCount).toBe(0);
      expect(state.values.duplicatePaymentCount).toBe(0);
      expect(state.values.duplicateSafetyStatus).toBe("safe-deduplicated");
      expect(state.values.brokerStatus).toBe("normal");
    });

    it("harmful path: scaling consumer concurrency alone makes duplicates WORSE even though throughput looks healthy", () => {
      const baseline = runScenario(ACK_FAILURES_BEGIN_MS + 20_000);
      const scaled = runScenario(ACK_FAILURES_BEGIN_MS + 20_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 16 },
      ]);

      // The trap: throughput looks better under scaling...
      expect(scaled.values.consumerThroughputPerSec).toBeGreaterThan(
        baseline.values.consumerThroughputPerSec as number,
      );
      // ...but duplicate counts are WORSE, not better.
      expect(scaled.values.duplicateOrderCount).toBeGreaterThan(
        baseline.values.duplicateOrderCount as number,
      );
      expect(scaled.values.duplicatePaymentCount).toBeGreaterThan(
        baseline.values.duplicatePaymentCount as number,
      );
      expect(scaled.values.duplicateSafetyStatus).toBe("unsafe-duplicating");
    });

    it("harmful path: lowering the ack timeout aggressively amplifies redelivery and duplicates", () => {
      const baseline = runScenario(ACK_FAILURES_BEGIN_MS + 20_000);
      const lowered = runScenario(ACK_FAILURES_BEGIN_MS + 20_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: ACK_TIMEOUT_MS_KEY, value: 200 },
      ]);

      expect(lowered.values.redeliveryVolumePerMin).toBeGreaterThan(
        baseline.values.redeliveryVolumePerMin as number,
      );
      expect(lowered.values.duplicateOrderCount).toBeGreaterThan(
        baseline.values.duplicateOrderCount as number,
      );
      expect(lowered.values.duplicateSafetyStatus).toBe("unsafe-duplicating");
    });

    it("baseline (no action) stays degraded with duplicates ongoing and never self-resolves", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 60_000);
      expect(state.status).toBe("degraded");
      expect(state.values.duplicateOrderCount as number).toBeGreaterThan(0);
    });

    it("delayed consequence: sustained unmitigated redelivery compounds duplicate accumulation on a second wave, with an observable precursor", () => {
      const beforeSecondWave = runScenario(ACK_FAILURES_BEGIN_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.redeliveryVolumePerMin as number).toBeGreaterThan(8);
      expect(beforeSecondWave.values.duplicateEventRatePct as number).toBeGreaterThan(0);

      const afterSecondWave = runScenario(SUSTAINED_REDELIVERY_MS + 5_000);
      expect(afterSecondWave.values.duplicateOrderCount).toBe(260);
      expect(afterSecondWave.values.duplicatePaymentCount).toBe(190);
      expect(afterSecondWave.values.duplicateOrderCount as number).toBeGreaterThan(
        beforeSecondWave.values.duplicateOrderCount as number,
      );
    });

    it("partial path: idempotency enabled without a real dedup window still leaves duplicates occurring", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 20_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY, value: true },
      ]);
      expect(state.values.duplicateOrderCount as number).toBeGreaterThan(0);
      expect(state.values.duplicateSafetyStatus).toBe("unsafe-duplicating");
    });

    it("fails if duplicate order count reaches 500 and stays there for the sustained window", () => {
      // Drive the harmful compounding-scaling trap long enough to cross
      // the failure threshold and sustain it.
      const state = runScenario(SUSTAINED_REDELIVERY_MS + 61_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 16 },
      ]);
      expect(state.values.duplicateOrderCount).toBe(540);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak duplicate order count and peak redelivery volume generically via numericWatchFields", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 1_000);
      expect(state.peaks.peakValues.duplicateOrderCount).toBe(60);
      expect(state.peaks.peakValues.redeliveryVolumePerMin).toBe(85);
    });

    it("tracks monthly infrastructure cost that increases with concurrency and dedup window", () => {
      let state = createInitialState(duplicateEventProcessingSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(150);

      const tickMs = duplicateEventProcessingSimulation.tickMs;
      state = simulate(
        duplicateEventProcessingSimulation,
        state,
        { id: "scale-concurrency", timestampMs: 0, controlKey: CONSUMER_CONCURRENCY_KEY, value: 32 },
        tickMs,
      ).state;
      state = simulate(
        duplicateEventProcessingSimulation,
        state,
        { id: "widen-window", timestampMs: tickMs, controlKey: DEDUPLICATION_WINDOW_SECONDS_KEY, value: 600 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(150 + 420 + 60);
    });
  });

  describe("Critical: the healthy-looking-but-corrupt state must never resolve", () => {
    it("the harmful concurrency trap keeps duplicateOrderCount/duplicatePaymentCount real and nonzero, even as throughput looks fully recovered", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 20_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 32 },
      ]);
      // Throughput looks healthy/available.
      expect(state.values.consumerThroughputPerSec as number).toBeGreaterThan(900);
      expect(state.values.brokerStatus).toBe("normal");
      // But correctness is actively violated.
      expect(state.values.duplicateOrderCount as number).toBeGreaterThan(0);
      expect(state.values.duplicatePaymentCount as number).toBeGreaterThan(0);
      expect(state.values.duplicateSafetyStatus).toBe("unsafe-duplicating");
    });

    it("the harmful concurrency trap does not satisfy successCondition", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 20_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 32 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(duplicateEventProcessingSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("Finish from the harmful-but-fast trap routes to declared_unstable, never resolved", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 20_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 32 },
      ]);
      const result = evaluateCandidateDeclaredFinish(duplicateEventProcessingSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("sustaining the trap for the full success window still never flips consecutiveSuccessSeconds past the bar", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 25_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 16 },
      ]);
      expect(state.transitions.consecutiveSuccessSeconds).toBe(0);
    });
  });

  describe("Phase 6.1: candidate-declared completion, no acceptable tier", () => {
    it("the optimal (deduplicated) path is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 25_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY, value: true },
        { atMs: ACK_FAILURES_BEGIN_MS + 2_000, controlKey: DEDUPLICATION_WINDOW_SECONDS_KEY, value: 120 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(duplicateEventProcessingSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 25_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY, value: true },
        { atMs: ACK_FAILURES_BEGIN_MS + 2_000, controlKey: DEDUPLICATION_WINDOW_SECONDS_KEY, value: 120 },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        duplicateEventProcessingSimulation.successCondition.sustainedSeconds,
      );
    });

    it("has no acceptableCondition authored", () => {
      expect(duplicateEventProcessingSimulation.completion?.acceptableCondition).toBeUndefined();
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 25_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY, value: true },
        { atMs: ACK_FAILURES_BEGIN_MS + 2_000, controlKey: DEDUPLICATION_WINDOW_SECONDS_KEY, value: 120 },
      ]);
      const result = evaluateCandidateDeclaredFinish(duplicateEventProcessingSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(duplicateEventProcessingSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the partial idempotency-without-window state -> declared_unstable", () => {
      const state = runScenario(ACK_FAILURES_BEGIN_MS + 20_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(duplicateEventProcessingSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_REDELIVERY_MS + 61_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 16 },
      ]);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(duplicateEventProcessingSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY, value: true },
        { atMs: ACK_FAILURES_BEGIN_MS + 2_000, controlKey: DEDUPLICATION_WINDOW_SECONDS_KEY, value: 120 },
      ];
      const runA = runScenario(ACK_FAILURES_BEGIN_MS + 25_000, actions);
      const runB = runScenario(ACK_FAILURES_BEGIN_MS + 25_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (deduplicated), baseline, harmful (concurrency trap), and the corrupt-but-available state with coherent ordering, and Data Integrity discriminates them", () => {
      const goodState = runScenario(ACK_FAILURES_BEGIN_MS + 25_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY, value: true },
        { atMs: ACK_FAILURES_BEGIN_MS + 2_000, controlKey: DEDUPLICATION_WINDOW_SECONDS_KEY, value: 120 },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(duplicateEventProcessingSimulation, goodState);
      expect(goodFinish.outcome).toBe("resolved");
      const goodScore = scoreAuthoredAttempt(
        DUPLICATE_EVENT_PROCESSING_SCORING,
        extractFinishScoringInputs(duplicateEventProcessingSimulation, goodFinish),
      );

      const baselineState = runScenario(ACK_FAILURES_BEGIN_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        DUPLICATE_EVENT_PROCESSING_SCORING,
        extractScoringInputs(duplicateEventProcessingSimulation, baselineState),
      );

      const harmfulState = runScenario(ACK_FAILURES_BEGIN_MS + 20_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 16 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        DUPLICATE_EVENT_PROCESSING_SCORING,
        extractScoringInputs(duplicateEventProcessingSimulation, harmfulState),
      );

      // The corrupt-but-available state: throughput/availability look
      // healthy (consumerThroughputPerSec very high, brokerStatus
      // "normal") while duplicates keep climbing. This is the state the
      // whole scenario exists to catch.
      const corruptButAvailableState = runScenario(ACK_FAILURES_BEGIN_MS + 20_000, [
        { atMs: ACK_FAILURES_BEGIN_MS + 1_000, controlKey: CONSUMER_CONCURRENCY_KEY, value: 32 },
      ]);
      expect(corruptButAvailableState.values.brokerStatus).toBe("normal");
      expect(corruptButAvailableState.values.consumerThroughputPerSec as number).toBeGreaterThan(900);
      const corruptScore = scoreAuthoredAttempt(
        DUPLICATE_EVENT_PROCESSING_SCORING,
        extractScoringInputs(duplicateEventProcessingSimulation, corruptButAvailableState),
      );

      // Execute and assert the real numbers.
      expect(goodScore.total).toBe(980);
      expect(baselineScore.total).toBe(370);
      expect(harmfulScore.total).toBe(280);
      expect(corruptScore.total).toBe(265);

      // Data Integrity sub-score must be measurably lower for the
      // corrupt-but-available state than for the genuinely optimal state
      // — the central product requirement of this scenario.
      expect(goodScore.breakdown.dataIntegrity).toBe(200);
      expect(corruptScore.breakdown.dataIntegrity).toBe(20);
      expect(corruptScore.breakdown.dataIntegrity).toBeLessThan(goodScore.breakdown.dataIntegrity);

      // Ordering sanity: good clearly beats every unresolved path; none
      // of the never-resolved/harmful paths outscore each other
      // unexpectedly (all share the same unresolved terminalOverride
      // floor on recovery/reliability since none of them ever reach
      // Finish eligibility).
      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(goodScore.total).toBeGreaterThan(corruptScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });
  });
});
