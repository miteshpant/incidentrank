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
import { globalCheckoutBrownout } from "./global-checkout-brownout";
import {
  ENRICHMENT_MODE_KEY,
  INVENTORY_RESERVATION_STRATEGY_KEY,
  MAX_CHECKOUT_CONCURRENCY_KEY,
  PRICING_MODE_KEY,
  PROMOTIONS_MODE_KEY,
  RETRY_POLICY_KEY,
  TAX_MODE_KEY,
  TIMEOUT_BUDGET_MS_KEY,
  globalCheckoutBrownoutSimulation,
} from "./global-checkout-brownout/definition";
import { globalCheckoutBrownoutCandidateUI } from "./global-checkout-brownout/candidate-ui";
import { GLOBAL_CHECKOUT_BROWNOUT_SCORING } from "./global-checkout-brownout/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(globalCheckoutBrownoutSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += globalCheckoutBrownoutSimulation.tickMs
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
      globalCheckoutBrownoutSimulation,
      state,
      action,
      globalCheckoutBrownoutSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const DEPENDENCIES_DEGRADED_MS = 30_000;
const DEPENDENCIES_RECOVERED_MS = DEPENDENCIES_DEGRADED_MS + 6 * 60_000;

// Shared full-trim action set used by multiple tests below.
const FULL_TRIM_ACTIONS: TimedAction[] = [
  { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: PROMOTIONS_MODE_KEY, value: "disabled" },
  { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: TAX_MODE_KEY, value: "bounded-fallback" },
  { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: PRICING_MODE_KEY, value: "cached-fallback" },
  { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: ENRICHMENT_MODE_KEY, value: "reduced" },
];

describe("Global Checkout Brownout", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(globalCheckoutBrownout.isFree).toBe(false);
      expect(globalCheckoutBrownout.library?.category).toBe("Distributed Systems");
      expect(globalCheckoutBrownout.library?.tags.length).toBeGreaterThan(0);
      expect(globalCheckoutBrownout.library?.skills.length).toBeGreaterThan(0);
      expect(globalCheckoutBrownout.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = GLOBAL_CHECKOUT_BROWNOUT_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = GLOBAL_CHECKOUT_BROWNOUT_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the nine architecture nodes", () => {
      expect(globalCheckoutBrownoutCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(globalCheckoutBrownoutCandidateUI.controls.length).toBeGreaterThanOrEqual(6);
      expect(globalCheckoutBrownoutCandidateUI.components.length).toBe(9);
    });

    it("the architecture has nine flat nodes and eight edges, all synchronous calls from the orchestrator", () => {
      expect(globalCheckoutBrownoutSimulation.architecture.nodes.length).toBe(9);
      expect(globalCheckoutBrownoutSimulation.architecture.edges.length).toBe(8);
    });

    it("the briefing explicitly states the business invariants the candidate must infer", () => {
      expect(globalCheckoutBrownout.description).toMatch(/payment authorization and inventory reservation must remain correct/i);
      expect(globalCheckoutBrownout.description).toMatch(/promotions may be disabled/i);
      expect(globalCheckoutBrownout.description).toMatch(/bounded fallback/i);
      expect(globalCheckoutBrownout.description).toMatch(/reduced enrichment/i);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(globalCheckoutBrownoutSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.checkoutLatencyMs).toBe(800);
      expect(state.values.checkoutMitigationMode).toBe("unresolved");
    });

    it("dependency degradation triggers the incident; baseline (no mitigation) composes into unusable latency while every dependency individually only reads degraded, not down", () => {
      const state = runScenario(DEPENDENCIES_DEGRADED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(DEPENDENCIES_DEGRADED_MS);
      expect(state.status).toBe("critical");
      expect(state.values.checkoutLatencyMs).toBeGreaterThan(3_000);
      // Each individual dependency is "moderate," not catastrophic.
      expect(state.values.pricingErrorRatePct).toBeLessThan(15);
      expect(state.values.promotionsErrorRatePct).toBeLessThan(15);
      expect(state.values.taxErrorRatePct).toBeLessThan(15);
      // Correctness is untouched by the composition problem itself.
      expect(state.values.paymentAuthSuccessPct).toBe(100);
      expect(state.values.inventoryReservationSuccessPct).toBe(100);
    });

    it("strong path: trimming all three non-critical dependencies off the synchronous path restores latency while preserving correctness", () => {
      const state = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, FULL_TRIM_ACTIONS);
      expect(state.values.checkoutMitigationMode).toBe("critical-path-trimmed");
      expect(state.values.checkoutLatencyMs).toBeLessThanOrEqual(1_000);
      expect(state.values.paymentAuthSuccessPct).toBe(100);
      expect(state.values.inventoryReservationSuccessPct).toBe(100);
      expect(state.values.partialCheckoutPct).toBeGreaterThan(0);
    });

    it("alternate acceptable path: partial trim (Promotions + Tax only) is safe but does not reach the optimal latency bar", () => {
      const state = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: PROMOTIONS_MODE_KEY, value: "disabled" },
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: TAX_MODE_KEY, value: "bounded-fallback" },
      ]);
      expect(state.values.checkoutMitigationMode).toBe("critical-path-partially-trimmed");
      expect(state.values.checkoutLatencyMs).toBeGreaterThan(1_000);
      expect(state.values.checkoutLatencyMs).toBeLessThanOrEqual(1_800);
      expect(state.values.paymentAuthSuccessPct).toBe(100);
      expect(state.values.inventoryReservationSuccessPct).toBe(100);
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000);
      expect(state.status).toBe("critical");
      expect(state.values.checkoutMitigationMode).toBe("unresolved");
    });

    describe("Pressure-transfer: increasing retries across all dependencies", () => {
      it("moderate retries make latency, error rate, and concurrency measurably worse than untouched baseline, and spill onto Payment/Inventory", () => {
        const baseline = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000);
        const moderateRetry = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "moderate" },
        ]);

        expect(moderateRetry.values.checkoutLatencyMs).toBeGreaterThan(
          baseline.values.checkoutLatencyMs as number,
        );
        expect(moderateRetry.values.requestConcurrency).toBeGreaterThan(
          baseline.values.requestConcurrency as number,
        );
        // Payment and Inventory were never directly degraded, yet
        // amplification visibly reaches them.
        expect(moderateRetry.values.paymentErrorRatePct).toBeGreaterThan(
          baseline.values.paymentErrorRatePct as number,
        );
        expect(moderateRetry.values.inventoryErrorRatePct).toBeGreaterThan(
          baseline.values.inventoryErrorRatePct as number,
        );
      });

      it("aggressive retries are measurably worse than moderate retries, proving a monotonic amplification curve, and depress payment success below its safe floor", () => {
        const moderateRetry = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "moderate" },
        ]);
        const aggressiveRetry = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
        ]);

        expect(aggressiveRetry.values.checkoutLatencyMs).toBeGreaterThan(
          moderateRetry.values.checkoutLatencyMs as number,
        );
        expect(aggressiveRetry.values.paymentAuthSuccessPct).toBeLessThan(90);
        expect(moderateRetry.values.paymentAuthSuccessPct).toBeGreaterThanOrEqual(90);
      });

      it("sustained aggressive retry amplification never auto-fails the attempt, even past the old sustained window", () => {
        const state = runScenario(DEPENDENCIES_DEGRADED_MS + 91_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
        ]);
        expect(state.status).not.toBe("failed");
        expect(state.failedAtMs).toBeNull();
        expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
          globalCheckoutBrownoutSimulation.failureCondition.sustainedSeconds,
        );
      });
    });

    it("raising max concurrency alone (without trimming the path) makes checkout worse, not better", () => {
      const baseline = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000);
      const moreConcurrency = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: MAX_CHECKOUT_CONCURRENCY_KEY, value: 200 },
      ]);
      expect(moreConcurrency.values.checkoutLatencyMs).toBeGreaterThan(
        baseline.values.checkoutLatencyMs as number,
      );
    });

    describe("Timeout budget: a real latency-for-error-rate tradeoff", () => {
      it("tightening the timeout budget lowers latency but raises per-dependency error rates relative to the untouched baseline", () => {
        const baseline = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000);
        const tightened = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: TIMEOUT_BUDGET_MS_KEY, value: 2_000 },
        ]);

        expect(tightened.values.checkoutMitigationMode).toBe("unresolved");
        expect(tightened.values.checkoutLatencyMs).toBeLessThan(
          baseline.values.checkoutLatencyMs as number,
        );
        expect(tightened.values.pricingErrorRatePct).toBeGreaterThan(
          baseline.values.pricingErrorRatePct as number,
        );
        expect(tightened.values.promotionsErrorRatePct).toBeGreaterThan(
          baseline.values.promotionsErrorRatePct as number,
        );
        expect(tightened.values.taxErrorRatePct).toBeGreaterThan(
          baseline.values.taxErrorRatePct as number,
        );
        // Never affects correctness.
        expect(tightened.values.paymentAuthSuccessPct).toBe(100);
        expect(tightened.values.inventoryReservationSuccessPct).toBe(100);
        // Real, executed values -- read from the actual run, never assumed.
        expect(tightened.values.checkoutLatencyMs).toBe(2_450);
        expect(tightened.values.pricingErrorRatePct).toBe(19);
      });

      it("loosening the timeout budget raises latency but lowers per-dependency error rates relative to the untouched baseline", () => {
        const baseline = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000);
        const loosened = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: TIMEOUT_BUDGET_MS_KEY, value: 8_000 },
        ]);

        expect(loosened.values.checkoutMitigationMode).toBe("unresolved");
        expect(loosened.values.checkoutLatencyMs).toBeGreaterThan(
          baseline.values.checkoutLatencyMs as number,
        );
        expect(loosened.values.pricingErrorRatePct).toBeLessThan(
          baseline.values.pricingErrorRatePct as number,
        );
        expect(loosened.values.promotionsErrorRatePct).toBeLessThan(
          baseline.values.promotionsErrorRatePct as number,
        );
        expect(loosened.values.taxErrorRatePct).toBeLessThan(
          baseline.values.taxErrorRatePct as number,
        );
        // Never affects correctness.
        expect(loosened.values.paymentAuthSuccessPct).toBe(100);
        expect(loosened.values.inventoryReservationSuccessPct).toBe(100);
        // Real, executed values -- read from the actual run, never assumed.
        expect(loosened.values.checkoutLatencyMs).toBe(4_100);
        expect(loosened.values.pricingErrorRatePct).toBe(4);
      });

      it("the timeout budget never reaches the acceptable latency bar on its own -- it is a tradeoff dial, not a critical-path fix", () => {
        const tightened = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: TIMEOUT_BUDGET_MS_KEY, value: 2_000 },
        ]);
        const eligibility = evaluateCompletionEligibility(globalCheckoutBrownoutSimulation, tightened);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Correctness trap: optimistic inventory reservation looks fast but is not safe", () => {
      it("Inventory's own latency/error metrics read healthy while a real, counted oversell risk accumulates", () => {
        const state = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: INVENTORY_RESERVATION_STRATEGY_KEY, value: "optimistic" },
        ]);
        expect(state.values.inventoryLatencyMs).toBeLessThan(100);
        expect(state.values.unreconciledOptimisticReservationCount).toBeGreaterThan(0);

        const eligibility = evaluateCompletionEligibility(globalCheckoutBrownoutSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("Finish from the optimistic-reservation trap -> declared_unstable, not resolved, regardless of how fast Inventory reads", () => {
        const state = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: INVENTORY_RESERVATION_STRATEGY_KEY, value: "optimistic" },
        ]);
        const result = evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });
    });

    describe("Sequencing", () => {
      it("safe sequence: choose the dominant mitigation (trim the critical path) before touching retries -- stays safe", () => {
        const state = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
          ...FULL_TRIM_ACTIONS,
          { atMs: DEPENDENCIES_DEGRADED_MS + 5_000, controlKey: RETRY_POLICY_KEY, value: "none" },
        ]);
        expect(state.values.checkoutMitigationMode).toBe("critical-path-trimmed");
        expect(state.values.checkoutLatencyMs).toBeLessThanOrEqual(1_000);
      });

      it("unsafe sequence: raise retries first (reaching the amplified state) before ever trimming the path -- the amplified consequence is real and observed before any fix lands", () => {
        const midwayAmplified = runScenario(DEPENDENCIES_DEGRADED_MS + 5_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
        ]);
        expect(midwayAmplified.values.checkoutMitigationMode).toBe("retry-amplified");
        expect(midwayAmplified.values.checkoutLatencyMs).toBeGreaterThan(9_000);
        expect(midwayAmplified.values.paymentAuthSuccessPct).toBeLessThan(90);

        // Even after later trimming the path, retries are still set to
        // aggressive -- the retry-amplified rule still wins (checked
        // before the trim rules), so the candidate must also reset
        // retries, not just trim the path, to actually reach safety.
        const stillAmplifiedAfterTrim = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
          { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
          ...FULL_TRIM_ACTIONS,
        ]);
        expect(stillAmplifiedAfterTrim.values.checkoutMitigationMode).toBe("retry-amplified");
        expect(stillAmplifiedAfterTrim.values.checkoutLatencyMs).toBeGreaterThan(1_000);
      });
    });

    it("delayed consequence: dependencies recover on their own schedule, with observable precursors visible well beforehand, and in-flight pressure drains over real elapsed time rather than vanishing instantly", () => {
      const beforeRecovery = runScenario(DEPENDENCIES_DEGRADED_MS + 10_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
      ]);
      expect(beforeRecovery.values.checkoutMitigationMode).toBe("retry-amplified");

      const afterRecovery = runScenario(DEPENDENCIES_RECOVERED_MS + 5_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
        { atMs: DEPENDENCIES_DEGRADED_MS + 50_000, controlKey: RETRY_POLICY_KEY, value: "none" },
      ]);
      expect(afterRecovery.values.checkoutPathStatus).toBe("normal");
      // Recovery lag: in-flight requests admitted under the heavier load
      // do not drain instantly -- a real, nonzero decaying count is
      // observed even after the dependency degradation itself is over.
      expect(afterRecovery.values.inFlightDrainingRequests).toBeGreaterThan(0);
    });

    describe("Immediate-Finish audit", () => {
      it("a zero-action Finish issued the instant dependencies degrade does NOT resolve (the untouched default composes into an unsafe state immediately)", () => {
        const state = runScenario(DEPENDENCIES_DEGRADED_MS + 1_000);
        const result = evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("a zero-action Finish issued before the degradation even starts is moot: no incident has started yet", () => {
        const state = runScenario(DEPENDENCIES_DEGRADED_MS - 5_000);
        expect(state.incidentStartedAtMs).toBeNull();
        const result = evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("even the correct full fix requires the full 30s sustained window before Finish is eligible", () => {
        // All four FULL_TRIM_ACTIONS share the same atMs but runScenario
        // applies at most one action per tick, so give it enough ticks
        // (one per action) for all four to land, while still staying
        // well short of the 30s sustain window.
        const justFixed = runScenario(DEPENDENCIES_DEGRADED_MS + 1_000 + 5_000, FULL_TRIM_ACTIONS);
        expect(justFixed.values.checkoutMitigationMode).toBe("critical-path-trimmed");
        const eligibility = evaluateCompletionEligibility(globalCheckoutBrownoutSimulation, justFixed);
        expect(eligibility.eligible).toBe(false);
        expect(justFixed.transitions.consecutiveSuccessSeconds).toBeLessThan(
          globalCheckoutBrownoutSimulation.successCondition.sustainedSeconds,
        );
      });
    });
  });

  describe("Completion mode: candidate_declared, with a real acceptable tier", () => {
    it("full trim reaches optimal eligibility", () => {
      const state = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, FULL_TRIM_ACTIONS);
      const eligibility = evaluateCompletionEligibility(globalCheckoutBrownoutSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("partial trim reaches acceptable (not optimal) eligibility", () => {
      const state = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: PROMOTIONS_MODE_KEY, value: "disabled" },
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: TAX_MODE_KEY, value: "bounded-fallback" },
      ]);
      const eligibility = evaluateCompletionEligibility(globalCheckoutBrownoutSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("Finish from full trim -> resolved/optimal; Finish from partial trim -> resolved/acceptable; Finish from baseline -> declared_unstable", () => {
      const fullState = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, FULL_TRIM_ACTIONS);
      expect(evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, fullState).completionTier).toBe("optimal");

      const partialState = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: PROMOTIONS_MODE_KEY, value: "disabled" },
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: TAX_MODE_KEY, value: "bounded-fallback" },
      ]);
      expect(evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, partialState).completionTier).toBe("acceptable");

      const baselineState = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000);
      const baselineResult = evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, baselineState);
      expect(baselineResult.outcome).toBe("declared_unstable");
      expect(baselineResult.completionTier).toBeNull();
    });

    it("a sustained harmful configuration never auto-fails, but Finish from it still only reaches declared_unstable", () => {
      const state = runScenario(DEPENDENCIES_DEGRADED_MS + 91_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, FULL_TRIM_ACTIONS);
      const runB = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, FULL_TRIM_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal (full trim), acceptable (partial trim), baseline, and harmful (aggressive retry) with coherent ordering, all from real executed runs", () => {
      const optimalState = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, FULL_TRIM_ACTIONS);
      const optimalFinish = evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        GLOBAL_CHECKOUT_BROWNOUT_SCORING,
        extractFinishScoringInputs(globalCheckoutBrownoutSimulation, optimalFinish),
      );

      const acceptableState = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: PROMOTIONS_MODE_KEY, value: "disabled" },
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: TAX_MODE_KEY, value: "bounded-fallback" },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        GLOBAL_CHECKOUT_BROWNOUT_SCORING,
        extractFinishScoringInputs(globalCheckoutBrownoutSimulation, acceptableFinish),
      );

      const baselineState = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        GLOBAL_CHECKOUT_BROWNOUT_SCORING,
        extractScoringInputs(globalCheckoutBrownoutSimulation, baselineState),
      );

      const harmfulState = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        GLOBAL_CHECKOUT_BROWNOUT_SCORING,
        extractScoringInputs(globalCheckoutBrownoutSimulation, harmfulState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(optimalScore.total).toBe(865);
      expect(acceptableScore.total).toBe(805);
      expect(baselineScore.total).toBe(360);
      expect(harmfulScore.total).toBe(250);

      // Suspicious-score checks (phase6dsupport.md section 16):
      // harmful must never score high, no-action/baseline must never
      // score high, optimal must strictly beat acceptable, and
      // acceptable must never exceed optimal.
      expect(harmfulScore.total).toBeLessThan(400);
      expect(baselineScore.total).toBeLessThan(400);
      expect(optimalScore.total).toBeGreaterThan(acceptableScore.total);
      expect(optimalScore.total).toBeGreaterThan(baselineScore.total);
      expect(optimalScore.total).toBeGreaterThan(harmfulScore.total);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);

      // Data Integrity is the dimension discriminating a real structural
      // fix (full marks) from a real but smaller mitigation (acceptable,
      // a genuine middle band) from everything else (bottom band).
      expect(optimalScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(140);
      expect(baselineScore.breakdown.dataIntegrity).toBe(50);
      expect(harmfulScore.breakdown.dataIntegrity).toBe(50);
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(
        optimalScore.breakdown.dataIntegrity,
      );
    });

    it("an availability-good/correctness-bad path (the optimistic-reservation trap) never scores near optimal despite Inventory's own latency reading healthy", () => {
      const optimalState = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, FULL_TRIM_ACTIONS);
      const optimalFinish = evaluateCandidateDeclaredFinish(globalCheckoutBrownoutSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        GLOBAL_CHECKOUT_BROWNOUT_SCORING,
        extractFinishScoringInputs(globalCheckoutBrownoutSimulation, optimalFinish),
      );

      const trapState = runScenario(DEPENDENCIES_DEGRADED_MS + 40_000, [
        { atMs: DEPENDENCIES_DEGRADED_MS + 1_000, controlKey: INVENTORY_RESERVATION_STRATEGY_KEY, value: "optimistic" },
      ]);
      const trapScore = scoreAuthoredAttempt(
        GLOBAL_CHECKOUT_BROWNOUT_SCORING,
        extractScoringInputs(globalCheckoutBrownoutSimulation, trapState),
      );

      // Inventory itself reads fast (low latency, low error rate) in
      // this state -- the trap is specifically that nothing in
      // availability/latency reveals the real problem. Despite that,
      // the total must land far below optimal.
      expect(trapState.values.inventoryLatencyMs).toBeLessThan(100);
      expect(trapScore.total).toBe(295);
      expect(trapScore.total).toBeLessThan(400);
      expect(trapScore.total).toBeLessThan(optimalScore.total);
      expect(trapScore.breakdown.dataIntegrity).toBe(50);
    });
  });
});
