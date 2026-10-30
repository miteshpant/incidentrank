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
import { requestTimeoutCascade } from "./request-timeout-cascade";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
  CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
  GATEWAY_RETRY_COUNT_KEY,
  GATEWAY_TO_A_TIMEOUT_MS_KEY,
  requestTimeoutCascadeSimulation,
  REQUEST_CANCELLATION_ENABLED_KEY,
} from "./request-timeout-cascade/definition";
import { requestTimeoutCascadeCandidateUI } from "./request-timeout-cascade/candidate-ui";
import { REQUEST_TIMEOUT_CASCADE_SCORING } from "./request-timeout-cascade/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(requestTimeoutCascadeSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += requestTimeoutCascadeSimulation.tickMs
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
      requestTimeoutCascadeSimulation,
      state,
      action,
      requestTimeoutCascadeSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const DEPENDENCY_BLIP_MS = 30_000;
const ACCUMULATION_SATURATION_MS = DEPENDENCY_BLIP_MS + 3 * 60_000;

const FULL_REBUDGET_ACTIONS: TimedAction[] = [
  { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: B_TO_DEPENDENCY_TIMEOUT_MS_KEY, value: 900 },
  { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_200 },
  { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: GATEWAY_TO_A_TIMEOUT_MS_KEY, value: 1_800 },
  { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: REQUEST_CANCELLATION_ENABLED_KEY, value: true },
];

describe("Request Timeout Cascade", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(requestTimeoutCascade.isFree).toBe(false);
      expect(requestTimeoutCascade.library?.category).toBe("API & Traffic");
      expect(requestTimeoutCascade.library?.tags.length).toBeGreaterThan(0);
      expect(requestTimeoutCascade.library?.skills.length).toBeGreaterThan(0);
      expect(requestTimeoutCascade.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = REQUEST_TIMEOUT_CASCADE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = REQUEST_TIMEOUT_CASCADE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(requestTimeoutCascadeCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(requestTimeoutCascadeCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(requestTimeoutCascadeCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(requestTimeoutCascadeCandidateUI.components.length).toBe(5);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(requestTimeoutCascadeSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.customerSuccessRatePercent).toBe(100);
      expect(state.values.timeoutBudgetHealth).toBe("unresolved");
    });

    it("the dependency blip triggers the accumulation baseline incident", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(DEPENDENCY_BLIP_MS);
      expect(state.status).toBe("critical");
      expect(state.values.chainStatus).toBe("critical");
      expect(state.values.customerSuccessRatePercent).toBe(22);
      expect(state.values.abandonedInFlightRequests).toBe(280);
    });

    it("strong path: re-proportioning the full budget AND enabling cancellation recovers the chain end to end", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 20_000, FULL_REBUDGET_ACTIONS);
      expect(state.values.chainStatus).toBe("normal");
      expect(state.values.customerSuccessRatePercent).toBe(97);
      expect(state.values.timeoutBudgetHealth).toBe("rebudgeted");
      expect(state.values.abandonedInFlightRequests).toBe(0);
    });

    it("alternate good path: tripping the circuit breaker also recovers the chain, by fencing off the Dependency", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 20_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY, value: true },
      ]);
      expect(state.values.chainStatus).toBe("warning");
      expect(state.values.customerSuccessRatePercent).toBe(89);
      expect(state.values.timeoutBudgetHealth).toBe("fenced");
      expect(state.values.abandonedInFlightRequests).toBe(0);
    });

    it("central lesson: re-proportioning the budget alone, with cancellation off, still accumulates abandoned work", () => {
      const budgetOnly = runScenario(DEPENDENCY_BLIP_MS + 20_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: B_TO_DEPENDENCY_TIMEOUT_MS_KEY, value: 900 },
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_200 },
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: GATEWAY_TO_A_TIMEOUT_MS_KEY, value: 1_800 },
      ]);
      expect(budgetOnly.values.timeoutBudgetHealth).toBe("unresolved");
      expect(budgetOnly.values.chainStatus).toBe("critical");
      expect(budgetOnly.values.abandonedInFlightRequests).toBe(260);
      expect(budgetOnly.values.customerSuccessRatePercent).toBe(52);
    });

    it("central lesson: enabling cancellation alone, with the budget misaligned, bounds accumulation but customer latency stays bad", () => {
      const cancelOnly = runScenario(DEPENDENCY_BLIP_MS + 20_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: REQUEST_CANCELLATION_ENABLED_KEY, value: true },
      ]);
      expect(cancelOnly.values.timeoutBudgetHealth).toBe("unresolved");
      expect(cancelOnly.values.chainStatus).toBe("critical");
      expect(cancelOnly.values.abandonedInFlightRequests).toBe(10);
      expect(cancelOnly.values.customerLatencyMs).toBe(8_800);
    });

    it("harmful path: raising Gateway retries multiplies in-flight chains and worsens every metric versus baseline", () => {
      const baseline = runScenario(DEPENDENCY_BLIP_MS + 20_000);
      const amplified = runScenario(DEPENDENCY_BLIP_MS + 20_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: GATEWAY_RETRY_COUNT_KEY, value: 4 },
      ]);
      expect(amplified.values.inFlightRequests).toBeGreaterThan(
        baseline.values.inFlightRequests as number,
      );
      expect(amplified.values.customerSuccessRatePercent).toBeLessThan(
        baseline.values.customerSuccessRatePercent as number,
      );
      expect(amplified.values.chainStatus).toBe("critical");
    });

    it("partial, still unsafe: fixing only the innermost hop relieves Service B but leaves Gateway/Service A oversized and still critical", () => {
      const innerOnly = runScenario(DEPENDENCY_BLIP_MS + 20_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: B_TO_DEPENDENCY_TIMEOUT_MS_KEY, value: 900 },
      ]);
      // A genuine, visible improvement on the metric closest to the fix,
      // but the chain overall remains critical and unresolved — fixing
      // one hop alone is not the same as re-proportioning the budget.
      expect(innerOnly.values.chainStatus).toBe("critical");
      expect(innerOnly.values.timeoutBudgetHealth).toBe("unresolved");
      expect(innerOnly.values.abandonedInFlightRequests).toBeGreaterThan(0);
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.chainStatus).toBe("critical");
    });

    it("delayed consequence: sustained uncancelled retries finally saturate in-flight capacity on a second wave", () => {
      const beforeSecondWave = runScenario(DEPENDENCY_BLIP_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.inFlightRequests).toBeGreaterThanOrEqual(300);
      expect(beforeSecondWave.values.connectionUtilizationPercent).toBeGreaterThanOrEqual(80);

      const afterSecondWave = runScenario(ACCUMULATION_SATURATION_MS + 5_000);
      expect(afterSecondWave.values.connectionUtilizationPercent).toBe(100);
      expect(afterSecondWave.values.customerSuccessRatePercent).toBe(9);
    });

    it("stays active (never auto-fails) even after customer success rate remains at or below 10% past the old sustained window", () => {
      const state = runScenario(ACCUMULATION_SATURATION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        requestTimeoutCascadeSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks monthly infrastructure cost that increases with elevated Gateway retries", () => {
      let state = createInitialState(requestTimeoutCascadeSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(380);

      const tickMs = requestTimeoutCascadeSimulation.tickMs;
      state = simulate(
        requestTimeoutCascadeSimulation,
        state,
        { id: "raise-retries", timestampMs: 0, controlKey: GATEWAY_RETRY_COUNT_KEY, value: 4 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(380 + 240);
    });
  });

  describe("Phase 6.1: two-tier completion — rebudgeted (optimal) vs fenced (acceptable)", () => {
    it("fully re-proportioned budget plus cancellation, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 40_000, FULL_REBUDGET_ACTIONS);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(requestTimeoutCascadeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("circuit breaker open, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 40_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(requestTimeoutCascadeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("budget-fixed-but-cancellation-off remains ineligible for any Finish tier", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 40_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: B_TO_DEPENDENCY_TIMEOUT_MS_KEY, value: 900 },
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_200 },
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: GATEWAY_TO_A_TIMEOUT_MS_KEY, value: 1_800 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(requestTimeoutCascadeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 40_000, FULL_REBUDGET_ACTIONS);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        requestTimeoutCascadeSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 40_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        requestTimeoutCascadeSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 40_000, FULL_REBUDGET_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(requestTimeoutCascadeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 40_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(requestTimeoutCascadeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(DEPENDENCY_BLIP_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(requestTimeoutCascadeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("immediate zero-action Finish at the very start of the incident never resolves", () => {
      const state = createInitialState(requestTimeoutCascadeSimulation);
      const result = evaluateCandidateDeclaredFinish(requestTimeoutCascadeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
      expect(state.values.timeoutBudgetHealth).toBe("unresolved");
    });

    it("never auto-fails even past the old sustained window, and a candidate_declared Finish there still yields declared_unstable", () => {
      const state = runScenario(ACCUMULATION_SATURATION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(requestTimeoutCascadeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(DEPENDENCY_BLIP_MS + 20_000, FULL_REBUDGET_ACTIONS);
      const runB = runScenario(DEPENDENCY_BLIP_MS + 20_000, FULL_REBUDGET_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (rebudgeted), acceptable (fenced), baseline, and harmful (retry multiplication) paths with coherent ordering", () => {
      const goodState = runScenario(DEPENDENCY_BLIP_MS + 40_000, FULL_REBUDGET_ACTIONS);
      const goodFinish = evaluateCandidateDeclaredFinish(requestTimeoutCascadeSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        REQUEST_TIMEOUT_CASCADE_SCORING,
        extractFinishScoringInputs(requestTimeoutCascadeSimulation, goodFinish),
      );

      const acceptableState = runScenario(DEPENDENCY_BLIP_MS + 40_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY, value: true },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        requestTimeoutCascadeSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        REQUEST_TIMEOUT_CASCADE_SCORING,
        extractFinishScoringInputs(requestTimeoutCascadeSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(DEPENDENCY_BLIP_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        REQUEST_TIMEOUT_CASCADE_SCORING,
        extractScoringInputs(requestTimeoutCascadeSimulation, baselineState),
      );

      const harmfulState = runScenario(DEPENDENCY_BLIP_MS + 20_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: GATEWAY_RETRY_COUNT_KEY, value: 4 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        REQUEST_TIMEOUT_CASCADE_SCORING,
        extractScoringInputs(requestTimeoutCascadeSimulation, harmfulState),
      );

      // Genuine partial path (budget fixed, cancellation off — the
      // scenario's central distinguishing state) never reaches Finish
      // eligibility either, scored the same never-resolved way.
      const partialState = runScenario(DEPENDENCY_BLIP_MS + 20_000, [
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: B_TO_DEPENDENCY_TIMEOUT_MS_KEY, value: 900 },
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_200 },
        { atMs: DEPENDENCY_BLIP_MS + 1_000, controlKey: GATEWAY_TO_A_TIMEOUT_MS_KEY, value: 1_800 },
      ]);
      const partialScore = scoreAuthoredAttempt(
        REQUEST_TIMEOUT_CASCADE_SCORING,
        extractScoringInputs(requestTimeoutCascadeSimulation, partialState),
      );

      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(825);
      expect(baselineScore.total).toBe(550);
      expect(partialScore.total).toBe(550);
      expect(harmfulScore.total).toBe(490);

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
      // The partial (budget-only) state never crosses Finish eligibility
      // (see the completion-mode test above), so it is scored as an
      // unresolved attempt just like baseline. This is a legitimate
      // tie-break, not a design flaw: the scenario's Finish gate, not a
      // numeric score alone, is what tells the candidate this state is
      // not safe to hand back.
      expect(partialScore.total).toBeLessThanOrEqual(baselineScore.total);
    });
  });
});
