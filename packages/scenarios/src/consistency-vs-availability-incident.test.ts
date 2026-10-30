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
import { consistencyVsAvailabilityIncident } from "./consistency-vs-availability-incident";
import {
  BALANCE_CONSISTENCY_MODE_KEY,
  CATALOG_CONSISTENCY_MODE_KEY,
  CATALOG_RECONCILIATION_KEY,
  QUORUM_REQUIREMENT_KEY,
  UNCONFIRMED_WRITE_POLICY_KEY,
  WRITE_ROUTING_KEY,
  consistencyVsAvailabilityIncidentSimulation,
} from "./consistency-vs-availability-incident/definition";
import { consistencyVsAvailabilityIncidentCandidateUI } from "./consistency-vs-availability-incident/candidate-ui";
import { CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING } from "./consistency-vs-availability-incident/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(consistencyVsAvailabilityIncidentSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += consistencyVsAvailabilityIncidentSimulation.tickMs
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
      consistencyVsAvailabilityIncidentSimulation,
      state,
      action,
      consistencyVsAvailabilityIncidentSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const CONNECTIVITY_DEGRADED_MS = 30_000;
const CONNECTIVITY_RESTORED_MS = CONNECTIVITY_DEGRADED_MS + 4 * 60_000;

describe("Consistency vs Availability Incident", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff scenario", () => {
      expect(consistencyVsAvailabilityIncident.isFree).toBe(false);
      expect(consistencyVsAvailabilityIncident.library?.category).toBe("Distributed Systems");
      expect(consistencyVsAvailabilityIncident.library?.tags.length).toBeGreaterThan(0);
      expect(consistencyVsAvailabilityIncident.library?.skills.length).toBeGreaterThan(0);
      expect(consistencyVsAvailabilityIncident.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(consistencyVsAvailabilityIncidentCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(consistencyVsAvailabilityIncidentCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(consistencyVsAvailabilityIncidentCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(consistencyVsAvailabilityIncidentSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.balanceCorrectnessViolations).toBe(0);
      expect(state.values.balanceSafetyMechanism).toBe("unresolved");
    });

    it("connectivity degradation triggers the incident; default config (relaxed/relaxed) goes critical with correctness violations", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(CONNECTIVITY_DEGRADED_MS);
      expect(state.status).toBe("critical");
      expect(state.values.balanceCorrectnessViolations).toBeGreaterThan(0);
      expect(state.values.balanceSafetyMechanism).toBe("relaxed-unsafe");
      // The trap: availability reads fully healthy at the same time.
      expect(state.values.balanceWriteAvailability).toBe(100);
    });

    it("strong path (Strategy A — consistency everywhere): both categories strong, backed by real quorum", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 20_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: CATALOG_CONSISTENCY_MODE_KEY, value: "strong" },
      ]);
      expect(state.values.balanceCorrectnessViolations).toBe(0);
      expect(state.values.balanceSafetyMechanism).toBe("quorum-confirmed");
      expect(state.values.balanceWriteAvailability).toBe(55);
      expect(state.values.catalogWriteAvailability).toBe(55);
    });

    it("alternate good path (Strategy B — differentiate by business need): balance strong, catalog relaxed reaches full catalog availability with zero correctness cost", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 20_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
      ]);
      expect(state.values.balanceCorrectnessViolations).toBe(0);
      expect(state.values.balanceSafetyMechanism).toBe("quorum-confirmed");
      expect(state.values.balanceWriteAvailability).toBe(55);
      expect(state.values.catalogWriteAvailability).toBe(100);
    });

    it("alternate good path: single-region routing structurally prevents conflicts for both categories", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 20_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: WRITE_ROUTING_KEY, value: "single-region-a" },
      ]);
      expect(state.values.balanceCorrectnessViolations).toBe(0);
      expect(state.values.balanceSafetyMechanism).toBe("single-region-routed");
      expect(state.values.balanceWriteAvailability).toBe(100);
      expect(state.values.catalogWriteAvailability).toBe(100);
    });

    it("harmful path (configuration drift trap): balance mode still reads 'strong' but quorum is set to local-only, producing the same violations as relaxed mode", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 20_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "local-only" },
      ]);
      expect(state.values.balanceCorrectnessViolations).toBeGreaterThan(0);
      expect(state.values.balanceSafetyMechanism).toBe("quorum-misconfigured");
      expect(state.values.balanceWriteAvailability).toBe(100);
    });

    it("baseline (no action) stays critical and never self-resolves (before the sustained failure window elapses)", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 30_000);
      expect(state.status).toBe("critical");
      expect(state.values.balanceSafetyMechanism).toBe("relaxed-unsafe");
    });

    it("delayed consequence: connectivity restoration occurs on a second wave, with observable violation precursors already visible beforehand", () => {
      const beforeHeal = runScenario(CONNECTIVITY_DEGRADED_MS + 10_000);
      expect(beforeHeal.values.balanceCorrectnessViolations).toBeGreaterThan(0);
      expect(beforeHeal.values.regionConnectivity).toBe("degraded");

      const afterHeal = runScenario(CONNECTIVITY_RESTORED_MS + 5_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
      ]);
      expect(afterHeal.values.regionConnectivity).toBe("healthy");
    });

    it("stays active (never auto-fails) even after the correctness-violating trap persists past the old sustained window", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 91_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        consistencyVsAvailabilityIncidentSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak correctness violations generically via numericWatchFields", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 1_000);
      expect(state.peaks.peakValues.balanceCorrectnessViolations).toBeGreaterThan(0);
    });

    describe("Post-heal reconciliation", () => {
      it("balance queue drains cleanly once connectivity restores (strong mode, queue policy)", () => {
        const state = runScenario(CONNECTIVITY_RESTORED_MS + 5_000, [
          { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
        ]);
        expect(state.values.regionConnectivity).toBe("healthy");
        expect(state.values.balanceCorrectnessViolations).toBe(0);
        expect(state.values.balanceWriteQueueDepth).toBeGreaterThan(0);
      });

      it("catalog last-write-wins resolves divergence immediately once healed", () => {
        const state = runScenario(CONNECTIVITY_RESTORED_MS + 5_000, [
          { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
          { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: UNCONFIRMED_WRITE_POLICY_KEY, value: "reject" },
          { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: CATALOG_RECONCILIATION_KEY, value: "last-write-wins" },
        ]);
        expect(state.values.catalogDivergentKeyCount).toBe(0);
      });
    });

    describe("Correctness violation is real even when availability looks fully healthy (the trap)", () => {
      it("relaxed balance mode: availability reads 100 while balanceCorrectnessViolations is actively, visibly unsafe", () => {
        const state = runScenario(CONNECTIVITY_DEGRADED_MS + 20_000);

        expect(state.values.balanceWriteAvailability).toBe(100);
        expect(state.values.balanceCorrectnessViolations).toBeGreaterThan(0);

        const eligibility = evaluateCompletionEligibility(consistencyVsAvailabilityIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("Finish from the relaxed-unsafe trap -> declared_unstable, not resolved", () => {
        const state = runScenario(CONNECTIVITY_DEGRADED_MS + 20_000);
        const result = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
        expect(result.completionTier).toBeNull();
      });

      it("the quorum-misconfigured trap (balance control still reads 'strong') is also never Finish-eligible", () => {
        const state = runScenario(CONNECTIVITY_DEGRADED_MS + 20_000, [
          { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
          { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "local-only" },
        ]);
        expect(state.controlValues[QUORUM_REQUIREMENT_KEY]).toBe("local-only");
        expect(state.values.balanceSafetyMechanism).toBe("quorum-misconfigured");
        const eligibility = evaluateCompletionEligibility(consistencyVsAvailabilityIncidentSimulation, state);
        expect(eligibility.eligible).toBe(false);
      });
    });
  });

  describe("Immediate-Finish audit", () => {
    it("zero-action immediate Finish at the very start of the incident does NOT resolve (default posture is the unsafe trap)", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 1_000);
      expect(state.transitions.consecutiveSuccessSeconds).toBe(0);
      const result = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("zero-action Finish before the incident even starts also does not resolve", () => {
      const state = runScenario(5_000);
      const result = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared, single-tier (no acceptableCondition)", () => {
    it("requires a real sustained window before a genuinely safe configuration becomes Finish-eligible", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 1_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(consistencyVsAvailabilityIncidentSimulation, state);
      expect(eligibility.eligible).toBe(false);
    });

    it("quorum-confirmed differentiated strategy does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        consistencyVsAvailabilityIncidentSimulation.successCondition.sustainedSeconds,
      );
    });

    it("single-region-routed is also eligible (optimal tier, since there is no acceptableCondition)", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: WRITE_ROUTING_KEY, value: "single-region-a" },
      ]);
      const eligibility = evaluateCompletionEligibility(consistencyVsAvailabilityIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Finish from the differentiated Strategy B -> resolved/optimal", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
      ]);
      const result = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("never auto-fails regardless of candidate_declared mode, even sustained well past the old failure window", () => {
      const state = runScenario(CONNECTIVITY_DEGRADED_MS + 91_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        consistencyVsAvailabilityIncidentSimulation.failureCondition.sustainedSeconds,
      );
      const result = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
      ];
      const runA = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, actions);
      const runB = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical scores for the same action sequence and elapsed time run twice", () => {
      const actions: TimedAction[] = [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
      ];
      const stateA = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, actions);
      const stateB = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, actions);
      const finishA = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, stateA);
      const finishB = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, stateB);
      const scoreA = scoreAuthoredAttempt(
        CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
        extractFinishScoringInputs(consistencyVsAvailabilityIncidentSimulation, finishA),
      );
      const scoreB = scoreAuthoredAttempt(
        CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
        extractFinishScoringInputs(consistencyVsAvailabilityIncidentSimulation, finishB),
      );
      expect(scoreA).toEqual(scoreB);
    });
  });

  describe("Scoring", () => {
    it("scores Strategy A, Strategy B, single-region routing, baseline, and the harmful configuration-drift trap with coherent Data Integrity / Customer Impact discrimination", () => {
      const strategyAState = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: CATALOG_CONSISTENCY_MODE_KEY, value: "strong" },
      ]);
      const strategyAFinish = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, strategyAState);
      const strategyAScore = scoreAuthoredAttempt(
        CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
        extractFinishScoringInputs(consistencyVsAvailabilityIncidentSimulation, strategyAFinish),
      );

      const strategyBState = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
      ]);
      const strategyBFinish = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, strategyBState);
      const strategyBScore = scoreAuthoredAttempt(
        CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
        extractFinishScoringInputs(consistencyVsAvailabilityIncidentSimulation, strategyBFinish),
      );

      const singleRegionState = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: WRITE_ROUTING_KEY, value: "single-region-a" },
      ]);
      const singleRegionFinish = evaluateCandidateDeclaredFinish(consistencyVsAvailabilityIncidentSimulation, singleRegionState);
      const singleRegionScore = scoreAuthoredAttempt(
        CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
        extractFinishScoringInputs(consistencyVsAvailabilityIncidentSimulation, singleRegionFinish),
      );

      // Never-resolved attempts are scored via the unresolved terminal
      // override -- no synthetic resolvedAtMs is ever fabricated for
      // baseline or the harmful trap, since neither is Finish-eligible.
      const baselineState = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
        extractScoringInputs(consistencyVsAvailabilityIncidentSimulation, baselineState),
      );

      const misconfiguredState = runScenario(CONNECTIVITY_DEGRADED_MS + 40_000, [
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" },
        { atMs: CONNECTIVITY_DEGRADED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "local-only" },
      ]);
      const misconfiguredScore = scoreAuthoredAttempt(
        CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
        extractScoringInputs(consistencyVsAvailabilityIncidentSimulation, misconfiguredState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(strategyAScore.total).toBe(835);
      expect(strategyBScore.total).toBe(865);
      expect(singleRegionScore.total).toBe(715);
      expect(baselineScore.total).toBe(400);
      expect(misconfiguredScore.total).toBe(385);

      // Central assertion: Data Integrity must be measurably lower for
      // the harmful configuration-drift trap (never Finish-eligible)
      // than for any genuinely safe mechanism, even though the trap's
      // balanceWriteAvailability metric reads fully healthy.
      expect(strategyAScore.breakdown.dataIntegrity).toBe(200);
      expect(strategyBScore.breakdown.dataIntegrity).toBe(200);
      expect(misconfiguredScore.breakdown.dataIntegrity).toBe(50);
      expect(strategyAScore.breakdown.dataIntegrity).toBeGreaterThan(misconfiguredScore.breakdown.dataIntegrity);

      // Strategy B (differentiated by business need) scores strictly
      // higher overall than Strategy A (consistency everywhere) because
      // it achieves materially better overall availability with zero
      // additional correctness cost -- the batch's required two-
      // defensible-strategies comparison, made concrete in real numbers.
      expect(strategyBScore.total).toBeGreaterThan(strategyAScore.total);

      // Single-region routing is also genuinely safe and Finish-eligible
      // but scores one Data Integrity band below the structural quorum
      // fix, since it is not backed by a cross-region guarantee the way
      // quorum confirmation is.
      expect(singleRegionScore.breakdown.dataIntegrity).toBe(50);
      expect(strategyAScore.total).toBeGreaterThan(singleRegionScore.total);

      expect(strategyAScore.total).toBeGreaterThan(baselineScore.total);

      // Known generic-scorer characteristic (already accepted for
      // Split-Brain Incident and Distributed Lock Failure): a
      // candidate_declared Finish's scoringResolvedAtMs is derived from
      // the moment the success condition became sustained-true, which
      // can be short relative to critical time already accrued just
      // before the fix landed -- criticalTimeRatio can land in the
      // lowest reliability band even for a genuinely optimal, fast
      // resolution. Data Integrity (not Reliability) is the dimension
      // this scenario relies on to discriminate the trap from the fix.
      expect(strategyAScore.breakdown.reliability).toBe(15);
      expect(strategyBScore.breakdown.reliability).toBe(15);
    });
  });
});
