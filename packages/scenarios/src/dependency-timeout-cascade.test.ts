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
import { dependencyTimeoutCascade } from "./dependency-timeout-cascade";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  API_TO_A_TIMEOUT_MS_KEY,
  B_TO_C_RETRY_COUNT_KEY,
  B_TO_C_TIMEOUT_MS_KEY,
  CIRCUIT_BREAKER_B_TO_C_KEY,
  dependencyTimeoutCascadeSimulation,
  SERVICE_A_CONCURRENCY_LIMIT_KEY,
} from "./dependency-timeout-cascade/definition";
import { dependencyTimeoutCascadeCandidateUI } from "./dependency-timeout-cascade/candidate-ui";
import { DEPENDENCY_TIMEOUT_CASCADE_SCORING } from "./dependency-timeout-cascade/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(dependencyTimeoutCascadeSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += dependencyTimeoutCascadeSimulation.tickMs
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
      dependencyTimeoutCascadeSimulation,
      state,
      action,
      dependencyTimeoutCascadeSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const SERVICE_C_DEGRADED_MS = 30_000;
const RETRY_AMPLIFICATION_SATURATION_MS = SERVICE_C_DEGRADED_MS + 3 * 60_000;

describe("Dependency Timeout Cascade", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(dependencyTimeoutCascade.isFree).toBe(false);
      expect(dependencyTimeoutCascade.library?.category).toBe("Microservices & Dependencies");
      expect(dependencyTimeoutCascade.library?.tags.length).toBeGreaterThan(0);
      expect(dependencyTimeoutCascade.library?.skills.length).toBeGreaterThan(0);
      expect(dependencyTimeoutCascade.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = DEPENDENCY_TIMEOUT_CASCADE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = DEPENDENCY_TIMEOUT_CASCADE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(dependencyTimeoutCascadeCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(dependencyTimeoutCascadeCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(dependencyTimeoutCascadeCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(dependencyTimeoutCascadeCandidateUI.components.length).toBe(5);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(dependencyTimeoutCascadeSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.customerSuccessRatePercent).toBe(100);
      expect(state.values.timeoutBudgetHealth).toBe("unresolved");
    });

    it("Service C degrading triggers the cascading-exhaustion baseline incident", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(SERVICE_C_DEGRADED_MS);
      expect(state.status).toBe("critical");
      expect(state.values.chainStatus).toBe("critical");
      expect(state.values.customerSuccessRatePercent).toBe(14);
      expect(state.values.serviceBPoolUtilization).toBe(96);
    });

    it("strong path: re-proportioning the full timeout budget recovers the chain end to end", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_000 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: API_TO_A_TIMEOUT_MS_KEY, value: 1_500 },
      ]);
      expect(state.values.chainStatus).toBe("normal");
      expect(state.values.customerSuccessRatePercent).toBe(96);
      expect(state.values.timeoutBudgetHealth).toBe("budgeted");
      expect(state.values.serviceBPoolUtilization).toBe(18);
      expect(state.values.serviceAPoolUtilization).toBe(15);
      expect(state.values.apiPoolUtilization).toBe(12);
    });

    it("alternate good path: tripping the circuit breaker also recovers the chain, by fencing off Service C", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_C_KEY, value: true },
      ]);
      expect(state.values.chainStatus).toBe("warning");
      expect(state.values.customerSuccessRatePercent).toBe(88);
      expect(state.values.timeoutBudgetHealth).toBe("masked");
      expect(state.values.serviceBPoolUtilization).toBe(12);
    });

    it("harmful path: raising retries against the degraded Service C amplifies load and worsens every hop", () => {
      const baseline = runScenario(SERVICE_C_DEGRADED_MS + 20_000);
      const amplified = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_RETRY_COUNT_KEY, value: 5 },
      ]);
      expect(amplified.values.serviceCConnectionsInUse).toBeGreaterThan(
        baseline.values.serviceCConnectionsInUse as number,
      );
      expect(amplified.values.customerSuccessRatePercent).toBeLessThan(
        baseline.values.customerSuccessRatePercent as number,
      );
      expect(amplified.values.chainStatus).toBe("critical");
    });

    it("harmful path: cutting only the top-of-chain timeout wastes downstream work and is worse than baseline", () => {
      const baseline = runScenario(SERVICE_C_DEGRADED_MS + 20_000);
      const topCutAlone = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: API_TO_A_TIMEOUT_MS_KEY, value: 600 },
      ]);
      expect(topCutAlone.values.customerSuccessRatePercent).toBeLessThan(
        baseline.values.customerSuccessRatePercent as number,
      );
      expect(topCutAlone.values.timeoutRatePercent).toBeGreaterThan(
        baseline.values.timeoutRatePercent as number,
      );
      expect(topCutAlone.values.chainStatus).toBe("critical");
    });

    it("pressure-transfer: fixing the B->C timeout alone relieves Service B but, with retries still active, stresses Service C's own connections", () => {
      const baseline = runScenario(SERVICE_C_DEGRADED_MS + 20_000);

      const bFixedRetriesOn = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_RETRY_COUNT_KEY, value: 3 },
      ]);

      // Primary symptom relieved: Service B's own pool/latency recover
      // dramatically relative to baseline.
      expect(bFixedRetriesOn.values.serviceBPoolUtilization).toBeLessThan(
        baseline.values.serviceBPoolUtilization as number,
      );
      expect(bFixedRetriesOn.values.serviceBLatencyMs).toBeLessThan(
        baseline.values.serviceBLatencyMs as number,
      );

      // Secondary subsystem visibly constrained instead: Service C's own
      // connection usage is now higher than baseline, because B keeps
      // retrying the still-slow C.
      expect(bFixedRetriesOn.values.serviceCConnectionsInUse).toBeGreaterThan(
        baseline.values.serviceCConnectionsInUse as number,
      );
      expect(bFixedRetriesOn.values.serviceCConnectionsInUse).toBe(95);

      // The chain overall is still not safe to hand back — pressure
      // just moved, it did not disappear.
      expect(bFixedRetriesOn.values.chainStatus).toBe("critical");
      expect(bFixedRetriesOn.values.timeoutBudgetHealth).toBe("unresolved");
    });

    it("partial path: fixing B->C but leaving A->B at its original long budget still leaves Service A over-provisioned around a slow call", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
      ]);
      expect(state.values.serviceBPoolUtilization).toBe(19);
      expect(state.values.serviceAPoolUtilization).toBe(86);
      expect(state.values.chainStatus).toBe("critical");
      expect(state.values.timeoutBudgetHealth).toBe("unresolved");
    });

    it("partial path: the bulkhead (Service A concurrency limit) caps A's own exposure but Service B stays blocked on the degraded C", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: SERVICE_A_CONCURRENCY_LIMIT_KEY, value: 80 },
      ]);
      expect(state.values.serviceAPoolUtilization).toBe(42);
      expect(state.values.serviceBPoolUtilization).toBe(90);
      expect(state.values.chainStatus).toBe("critical");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.chainStatus).toBe("critical");
    });

    it("delayed consequence: sustained unmitigated retries finally saturate Service C's own connection pool on a second wave", () => {
      const beforeSecondWave = runScenario(SERVICE_C_DEGRADED_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.serviceCConnectionsInUse).toBeGreaterThanOrEqual(70);
      expect(beforeSecondWave.values.serviceBPoolUtilization).toBeGreaterThanOrEqual(90);

      const afterSecondWave = runScenario(RETRY_AMPLIFICATION_SATURATION_MS + 5_000);
      expect(afterSecondWave.values.serviceCConnectionsInUse).toBe(100);
      expect(afterSecondWave.values.customerSuccessRatePercent).toBe(6);
    });

    it("stays active (never auto-fails) even after customer success rate remains at or below 10% past the old sustained window", () => {
      const state = runScenario(RETRY_AMPLIFICATION_SATURATION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        dependencyTimeoutCascadeSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks monthly infrastructure cost that increases with elevated retries", () => {
      let state = createInitialState(dependencyTimeoutCascadeSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(350);

      const tickMs = dependencyTimeoutCascadeSimulation.tickMs;
      state = simulate(
        dependencyTimeoutCascadeSimulation,
        state,
        { id: "raise-retries", timestampMs: 0, controlKey: B_TO_C_RETRY_COUNT_KEY, value: 5 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(350 + 260);
    });
  });

  describe("Phase 6.1: two-tier completion — budgeted (optimal) vs breaker-open (acceptable)", () => {
    it("fully re-proportioned budget, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_000 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: API_TO_A_TIMEOUT_MS_KEY, value: 1_500 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(dependencyTimeoutCascadeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("circuit breaker open, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_C_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(dependencyTimeoutCascadeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("the pressure-transfer state (B fixed, C's connections stressed) remains ineligible for any Finish tier", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_RETRY_COUNT_KEY, value: 3 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(dependencyTimeoutCascadeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_000 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: API_TO_A_TIMEOUT_MS_KEY, value: 1_500 },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        dependencyTimeoutCascadeSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_C_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        dependencyTimeoutCascadeSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_000 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: API_TO_A_TIMEOUT_MS_KEY, value: 1_500 },
      ]);
      const result = evaluateCandidateDeclaredFinish(dependencyTimeoutCascadeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_C_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(dependencyTimeoutCascadeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(SERVICE_C_DEGRADED_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(dependencyTimeoutCascadeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("candidate_declared mode still never auto-fails, even deep past the old sustained failure window", () => {
      const state = runScenario(RETRY_AMPLIFICATION_SATURATION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(dependencyTimeoutCascadeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_000 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: API_TO_A_TIMEOUT_MS_KEY, value: 1_500 },
      ];
      const runA = runScenario(SERVICE_C_DEGRADED_MS + 20_000, actions);
      const runB = runScenario(SERVICE_C_DEGRADED_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (budgeted), acceptable (breaker open), baseline, and harmful (retry amplification) paths with coherent ordering", () => {
      const goodState = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_000 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: API_TO_A_TIMEOUT_MS_KEY, value: 1_500 },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(dependencyTimeoutCascadeSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        DEPENDENCY_TIMEOUT_CASCADE_SCORING,
        extractFinishScoringInputs(dependencyTimeoutCascadeSimulation, goodFinish),
      );

      const acceptableState = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: CIRCUIT_BREAKER_B_TO_C_KEY, value: true },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        dependencyTimeoutCascadeSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        DEPENDENCY_TIMEOUT_CASCADE_SCORING,
        extractFinishScoringInputs(dependencyTimeoutCascadeSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(SERVICE_C_DEGRADED_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        DEPENDENCY_TIMEOUT_CASCADE_SCORING,
        extractScoringInputs(dependencyTimeoutCascadeSimulation, baselineState),
      );

      const harmfulState = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_RETRY_COUNT_KEY, value: 5 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        DEPENDENCY_TIMEOUT_CASCADE_SCORING,
        extractScoringInputs(dependencyTimeoutCascadeSimulation, harmfulState),
      );

      // Pressure-transfer path (genuine partial mitigation, never
      // reaches Finish eligibility) scored the same never-resolved way.
      const partialState = runScenario(SERVICE_C_DEGRADED_MS + 20_000, [
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
        { atMs: SERVICE_C_DEGRADED_MS + 1_000, controlKey: B_TO_C_RETRY_COUNT_KEY, value: 3 },
      ]);
      const partialScore = scoreAuthoredAttempt(
        DEPENDENCY_TIMEOUT_CASCADE_SCORING,
        extractScoringInputs(dependencyTimeoutCascadeSimulation, partialState),
      );

      expect(goodScore.total).toBe(850);
      expect(acceptableScore.total).toBe(825);
      expect(baselineScore.total).toBe(550);
      expect(partialScore.total).toBe(515);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
      // The pressure-transfer state never crosses Finish eligibility
      // (see the completion-mode test above), so it is scored as an
      // unresolved attempt just like baseline — but it costs slightly
      // more (elevated retries raise infrastructure cost) and never
      // improved on baseline's own revenue-loss rate, so it is not
      // rewarded above plain inaction. This is a legitimate tie-break,
      // not a design flaw: the scenario's Finish gate, not a numeric
      // score alone, is what tells the candidate this state is not safe
      // to hand back.
      expect(partialScore.total).toBeLessThanOrEqual(baselineScore.total);
    });
  });
});
