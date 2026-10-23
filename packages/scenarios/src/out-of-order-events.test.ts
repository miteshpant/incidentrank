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
import { outOfOrderEvents } from "./out-of-order-events";
import {
  CONSUMER_PARALLELISM_KEY,
  DELAYED_PROCESSING_TOLERANCE_KEY,
  outOfOrderEventsSimulation,
  PARTITION_KEY_STRATEGY_KEY,
  REORDER_BUFFER_ENABLED_KEY,
  SEQUENCE_VALIDATION_ENABLED_KEY,
} from "./out-of-order-events/definition";
import { outOfOrderEventsCandidateUI } from "./out-of-order-events/candidate-ui";
import { OUT_OF_ORDER_EVENTS_SCORING } from "./out-of-order-events/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(outOfOrderEventsSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += outOfOrderEventsSimulation.tickMs
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
      outOfOrderEventsSimulation,
      state,
      action,
      outOfOrderEventsSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const ROUTING_CHANGE_LIVE_MS = 30_000;
const SUSTAINED_LOAD_MS = ROUTING_CHANGE_LIVE_MS + 3 * 60_000;

describe("Out-of-Order Events", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(outOfOrderEvents.isFree).toBe(false);
      expect(outOfOrderEvents.library?.category).toBe("Messaging & Streaming");
      expect(outOfOrderEvents.library?.tags.length).toBeGreaterThan(0);
      expect(outOfOrderEvents.library?.skills.length).toBeGreaterThan(0);
      expect(outOfOrderEvents.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totalling 1000", () => {
      const dims = OUT_OF_ORDER_EVENTS_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = OUT_OF_ORDER_EVENTS_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(outOfOrderEventsCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(outOfOrderEventsCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(outOfOrderEventsCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(outOfOrderEventsCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(outOfOrderEventsSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.unreconciledViolationCount).toBe(0);
      expect(state.values.orderingIntegrityMode).toBe("unresolved");
    });

    it("the routing change fires and round-robin baseline produces growing unreconciled divergence", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(ROUTING_CHANGE_LIVE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.orderingViolationRate).toBe(60);
      expect(state.values.unreconciledViolationCount).toBe(600);
      expect(state.values.reconciliationRatePerSecond).toBe(0);
      expect(state.values.orderingIntegrityMode).toBe("unsafe-divergence");
    });

    it("strong path: re-keying by account id plus the reorder buffer fully restores ordering", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "account-id-keyed" },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
      ]);
      expect(state.values.unreconciledViolationCount).toBe(0);
      expect(state.values.orderingViolationRate).toBe(0);
      expect(state.values.orderingIntegrityMode).toBe("ordering-preserved");
      expect(state.values.materializedStateStatus).toBe("normal");
    });

    it("alternate acceptable path: round-robin kept with full safeguards and a long tolerance window proves bounded reconciliation", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 5_000 },
      ]);
      expect(state.values.orderingViolationRate).toBe(50);
      expect(state.values.reconciliationRatePerSecond).toBeGreaterThanOrEqual(
        state.values.orderingViolationRate as number,
      );
      expect(state.values.unreconciledViolationCount).toBeLessThanOrEqual(20);
      expect(state.values.orderingIntegrityMode).toBe("reordering-risk");
      expect(state.values.materializedStateStatus).not.toBe("critical");
    });

    it("harmful path: scaling consumer parallelism while round-robin keying is active amplifies divergence", () => {
      const baseline = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000);
      const scaled = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: CONSUMER_PARALLELISM_KEY, value: 16 },
      ]);

      expect(scaled.values.orderingViolationRate).toBeGreaterThan(
        baseline.values.orderingViolationRate as number,
      );
      expect(scaled.values.unreconciledViolationCount).toBeGreaterThan(
        baseline.values.unreconciledViolationCount as number,
      );
      expect(scaled.values.materializedStateStatus).toBe("critical");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.materializedStateStatus).toBe("critical");
    });

    it("delayed consequence: sustained unmitigated divergence compounds further on a second wave, with a visible precursor", () => {
      const beforeSecondWave = runScenario(ROUTING_CHANGE_LIVE_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.unreconciledViolationCount).toBeGreaterThan(0);
      expect(beforeSecondWave.values.staleStateCorrectionRate).toBeGreaterThan(0);

      const afterSecondWave = runScenario(SUSTAINED_LOAD_MS + 5_000);
      expect(afterSecondWave.values.unreconciledViolationCount).toBe(1_400);
      expect(afterSecondWave.values.orderingViolationRate).toBe(65);
    });

    it("fails once the unreconciled backlog stays at or above 1200 for the full sustained window", () => {
      const state = runScenario(SUSTAINED_LOAD_MS + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak unreconciled violations and peak violation rate generically via numericWatchFields", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 1_000);
      expect(state.peaks.peakValues.unreconciledViolationCount).toBe(600);
      expect(state.peaks.peakValues.orderingViolationRate).toBe(60);
    });

    it("tracks monthly infrastructure cost that increases with consumer parallelism and tolerance window", () => {
      let state = createInitialState(outOfOrderEventsSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(300);

      const tickMs = outOfOrderEventsSimulation.tickMs;
      state = simulate(
        outOfOrderEventsSimulation,
        state,
        { id: "scale-consumers", timestampMs: 0, controlKey: CONSUMER_PARALLELISM_KEY, value: 32 },
        tickMs,
      ).state;
      state = simulate(
        outOfOrderEventsSimulation,
        state,
        { id: "widen-tolerance", timestampMs: tickMs, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 5_000 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(300 + 480 + 40);
    });

    describe("Healthy-looking-but-corrupt state is real and must not satisfy Finish", () => {
      it("round-robin + sequence validation without the reorder buffer: throughput/lag look healthy but unreconciled violations grow unbounded", () => {
        const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
          { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
        ]);
        // Availability-looking metrics are healthy.
        expect(state.values.eventsPerSecond).toBe(3_200);
        expect(state.values.consumerLagMessages).toBe(60);
        // But correctness is actively violated and NOT reconciling.
        expect(state.values.unreconciledViolationCount).toBeGreaterThan(0);
        expect(state.values.reconciliationRatePerSecond).toBeLessThan(
          state.values.orderingViolationRate as number,
        );
        expect(state.values.orderingIntegrityMode).toBe("unsafe-divergence");

        expect(evaluateCompletionEligibility(outOfOrderEventsSimulation, state)).toEqual({
          eligible: false,
        });
      });

      it("round-robin + full safeguards but too-short tolerance window: throughput/lag look healthy but reconciliation can't keep pace", () => {
        const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
          { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
          { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
          { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 500 },
        ]);
        expect(state.values.eventsPerSecond).toBe(3_150);
        expect(state.values.consumerLagMessages).toBe(65);
        expect(state.values.unreconciledViolationCount).toBe(420);
        expect(state.values.reconciliationRatePerSecond).toBeLessThan(
          state.values.orderingViolationRate as number,
        );
        expect(state.values.orderingIntegrityMode).toBe("unsafe-divergence");

        expect(evaluateCompletionEligibility(outOfOrderEventsSimulation, state)).toEqual({
          eligible: false,
        });

        const finish = evaluateCandidateDeclaredFinish(outOfOrderEventsSimulation, state);
        expect(finish.outcome).toBe("declared_unstable");
        expect(finish.completionTier).toBeNull();
      });
    });
  });

  describe("Phase 6.1: two-tier completion — ordering-restored (optimal) vs bounded-reconciliation (acceptable)", () => {
    it("ordering-restored, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "account-id-keyed" },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(outOfOrderEventsSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("bounded-reconciliation, sustained, is eligible for an ACCEPTABLE-tier Finish — a genuine, proven-bounded tradeoff", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 5_000 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(outOfOrderEventsSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("re-keyed without the reorder buffer (partial, draining nothing) remains ineligible for any Finish tier", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "account-id-keyed" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(outOfOrderEventsSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "account-id-keyed" },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        outOfOrderEventsSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 5_000 },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        outOfOrderEventsSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "account-id-keyed" },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(outOfOrderEventsSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 5_000 },
      ]);
      const result = evaluateCandidateDeclaredFinish(outOfOrderEventsSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(outOfOrderEventsSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the healthy-looking-but-corrupt state -> declared_unstable (never resolved)", () => {
      const state = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 500 },
      ]);
      const result = evaluateCandidateDeclaredFinish(outOfOrderEventsSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_LOAD_MS + 61_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(outOfOrderEventsSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "account-id-keyed" },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
      ];
      const runA = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, actions);
      const runB = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical events and score for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 5_000 },
      ];
      const stateA = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, actions);
      const stateB = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, actions);
      const finishA = evaluateCandidateDeclaredFinish(outOfOrderEventsSimulation, stateA);
      const finishB = evaluateCandidateDeclaredFinish(outOfOrderEventsSimulation, stateB);
      const scoreA = scoreAuthoredAttempt(
        OUT_OF_ORDER_EVENTS_SCORING,
        extractFinishScoringInputs(outOfOrderEventsSimulation, finishA),
      );
      const scoreB = scoreAuthoredAttempt(
        OUT_OF_ORDER_EVENTS_SCORING,
        extractFinishScoringInputs(outOfOrderEventsSimulation, finishB),
      );
      expect(scoreA).toEqual(scoreB);
    });
  });

  describe("Scoring", () => {
    it("scores good (ordering-restored), acceptable (bounded-reconciliation), baseline, harmful, and corrupt-but-available paths with coherent ordering", () => {
      const goodState = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "account-id-keyed" },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(outOfOrderEventsSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        OUT_OF_ORDER_EVENTS_SCORING,
        extractFinishScoringInputs(outOfOrderEventsSimulation, goodFinish),
      );

      const acceptableState = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 5_000 },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        outOfOrderEventsSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        OUT_OF_ORDER_EVENTS_SCORING,
        extractFinishScoringInputs(outOfOrderEventsSimulation, acceptableFinish),
      );

      // Baseline/harmful/corrupt-but-available paths never reach Finish
      // eligibility — score them as never-resolved attempts via the
      // unresolved terminal override (no synthetic resolvedAtMs is ever
      // fabricated).
      const baselineState = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        OUT_OF_ORDER_EVENTS_SCORING,
        extractScoringInputs(outOfOrderEventsSimulation, baselineState),
      );

      const harmfulState = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: CONSUMER_PARALLELISM_KEY, value: 16 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        OUT_OF_ORDER_EVENTS_SCORING,
        extractScoringInputs(outOfOrderEventsSimulation, harmfulState),
      );

      // The healthy-looking-but-corrupt path: round-robin kept with full
      // safeguards but a too-short tolerance window. eventsPerSecond/
      // consumerLagMessages look just as healthy as the acceptable path,
      // but orderingIntegrityMode is "unsafe-divergence", never eligible
      // for Finish.
      const corruptButAvailableState = runScenario(ROUTING_CHANGE_LIVE_MS + 20_000, [
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: SEQUENCE_VALIDATION_ENABLED_KEY, value: true },
        { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: DELAYED_PROCESSING_TOLERANCE_KEY, value: 500 },
      ]);
      const corruptButAvailableScore = scoreAuthoredAttempt(
        OUT_OF_ORDER_EVENTS_SCORING,
        extractScoringInputs(outOfOrderEventsSimulation, corruptButAvailableState),
      );

      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(785);
      expect(baselineScore.total).toBe(410);
      expect(harmfulScore.total).toBeLessThanOrEqual(baselineScore.total);

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);

      // The critical assertion for this batch: Data Integrity must be
      // measurably lower for the corrupt-but-available (never-resolved,
      // "unsafe-divergence") state than for the genuinely optimal
      // ("ordering-preserved") state, even though both scenarios were
      // reached via all-safeguards-on configurations and could otherwise
      // look similar.
      expect(goodScore.breakdown.dataIntegrity).toBe(200);
      expect(corruptButAvailableScore.breakdown.dataIntegrity).toBe(60);
      expect(goodScore.breakdown.dataIntegrity).toBeGreaterThan(
        corruptButAvailableScore.breakdown.dataIntegrity,
      );

      // The acceptable (proven-bounded) tier scores a real, substantial,
      // but non-optimal Data Integrity amount — strictly between
      // optimal and the corrupt-but-available/baseline floor.
      expect(acceptableScore.breakdown.dataIntegrity).toBe(140);
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(
        goodScore.breakdown.dataIntegrity,
      );
      expect(acceptableScore.breakdown.dataIntegrity).toBeGreaterThan(
        corruptButAvailableScore.breakdown.dataIntegrity,
      );
    });
  });
});
