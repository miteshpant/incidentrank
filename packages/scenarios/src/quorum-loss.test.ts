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
import { quorumLoss } from "./quorum-loss";
import {
  MEMBERSHIP_SIZE_KEY,
  NODE_D_MEMBERSHIP_KEY,
  NODE_E_MEMBERSHIP_KEY,
  QUORUM_REQUIREMENT_KEY,
  quorumLossSimulation,
  READ_ONLY_MODE_KEY,
} from "./quorum-loss/definition";
import { quorumLossCandidateUI } from "./quorum-loss/candidate-ui";
import { QUORUM_LOSS_SCORING } from "./quorum-loss/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(quorumLossSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += quorumLossSimulation.tickMs) {
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

    const result = simulate(quorumLossSimulation, state, action, quorumLossSimulation.tickMs);
    state = result.state;
  }

  return state;
}

const QUORUM_THREATENED_MS = 30_000;
const NODE_C_WARNING_MS = QUORUM_THREATENED_MS + 60_000;
const QUORUM_LOST_MS = QUORUM_THREATENED_MS + 3 * 60_000;

describe("Quorum Loss", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(quorumLoss.isFree).toBe(false);
      expect(quorumLoss.library?.category).toBe("Distributed Systems");
      expect(quorumLoss.library?.tags.length).toBeGreaterThan(0);
      expect(quorumLoss.library?.skills.length).toBeGreaterThan(0);
      expect(quorumLoss.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = QUORUM_LOSS_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = QUORUM_LOSS_SCORING.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(quorumLossCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(quorumLossCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(quorumLossCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(quorumLossSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.healthyNodeCount).toBe(5);
      expect(state.values.quorumStatus).toBe("normal");
      expect(state.values.unsafeWriteCount).toBe(0);
    });

    it("the incident trigger isolates Node D and Node E, landing exactly at the quorum edge", () => {
      const state = runScenario(QUORUM_THREATENED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(QUORUM_THREATENED_MS);
      expect(state.values.healthyNodeCount).toBe(3);
      expect(state.values.quorumRequiredCount).toBe(3);
      expect(state.values.quorumStatus).toBe("warning");
      expect(state.values.writeAvailability).toBe(100);
      expect(state.values.unsafeWriteCount).toBe(0);
    });

    it("observable precursor: Node C's heartbeat degrades before it goes unreachable", () => {
      const state = runScenario(NODE_C_WARNING_MS + 1_000);
      expect(state.values.nodeCHeartbeatHealth).toBe("degrading");
      expect(state.values.healthyNodeCount).toBe(3);
      expect(state.values.quorumStatus).toBe("warning");
    });

    it("baseline (no action): second wave drops the group below quorum", () => {
      const state = runScenario(QUORUM_LOST_MS + 1_000);
      expect(state.values.healthyNodeCount).toBe(2);
      expect(state.values.quorumRequiredCount).toBe(3);
      expect(state.values.quorumStatus).toBe("critical");
    });

    it("harmful path: relaxed quorum + no read-only below quorum accepts unsafe writes while looking healthy", () => {
      const state = runScenario(QUORUM_LOST_MS + 5_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "relaxed-any-reachable" },
      ]);
      expect(state.values.quorumStatus).toBe("critical");
      expect(state.values.writeAvailability).toBe(100);
      expect(state.values.unsafeWriteCount).toBeGreaterThan(0);
      expect(state.values.quorumSafetyMechanism).toBe("unsafe-writes-accepted");
    });

    it("strong path: reconfiguring membership to three nodes restores genuine quorum regardless of Node C", () => {
      const state = runScenario(QUORUM_LOST_MS + 5_000, [
        { atMs: QUORUM_THREATENED_MS + 10_000, controlKey: NODE_D_MEMBERSHIP_KEY, value: "isolated" },
        { atMs: QUORUM_THREATENED_MS + 11_000, controlKey: NODE_E_MEMBERSHIP_KEY, value: "isolated" },
        { atMs: QUORUM_THREATENED_MS + 12_000, controlKey: MEMBERSHIP_SIZE_KEY, value: "three" },
      ]);
      expect(state.values.quorumStatus).toBe("normal");
      expect(state.values.healthyNodeCount).toBe(3);
      expect(state.values.quorumRequiredCount).toBe(2);
      expect(state.values.unsafeWriteCount).toBe(0);
      expect(state.values.quorumSafetyMechanism).toBe("membership-reconfigured");
    });

    it("alternate safe path: explicit read-only below quorum refuses writes correctly", () => {
      const state = runScenario(QUORUM_LOST_MS + 5_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: READ_ONLY_MODE_KEY, value: true },
      ]);
      expect(state.values.quorumStatus).toBe("critical");
      expect(state.values.writeAvailability).toBe(0);
      expect(state.values.unsafeWriteCount).toBe(0);
      expect(state.values.quorumSafetyMechanism).toBe("read-only-engaged");
    });

    it("alternate safe path: structural strict-majority refusal below quorum is equally safe without an explicit read-only switch", () => {
      const state = runScenario(QUORUM_LOST_MS + 5_000);
      expect(state.values.quorumStatus).toBe("critical");
      expect(state.values.writeAvailability).toBe(0);
      expect(state.values.unsafeWriteCount).toBe(0);
      expect(state.values.quorumSafetyMechanism).toBe("structural-refusal");
    });

    it("fails if unsafe writes without quorum accumulate and stay sustained", () => {
      const state = runScenario(QUORUM_LOST_MS + 61_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "relaxed-any-reachable" },
      ]);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak unsafe write count via numericWatchFields", () => {
      const state = runScenario(QUORUM_LOST_MS + 5_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "relaxed-any-reachable" },
      ]);
      expect(state.peaks.peakValues.unsafeWriteCount).toBeGreaterThan(0);
    });
  });

  describe("Phase 6.1: candidate-declared completion", () => {
    it("quorum genuinely held at the edge is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(QUORUM_THREATENED_MS + 31_000);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(quorumLossSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("membership reconfiguration restoring real quorum is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(QUORUM_LOST_MS + 31_000, [
        { atMs: QUORUM_THREATENED_MS + 10_000, controlKey: NODE_D_MEMBERSHIP_KEY, value: "isolated" },
        { atMs: QUORUM_THREATENED_MS + 11_000, controlKey: NODE_E_MEMBERSHIP_KEY, value: "isolated" },
        { atMs: QUORUM_THREATENED_MS + 12_000, controlKey: MEMBERSHIP_SIZE_KEY, value: "three" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(quorumLossSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("explicit read-only below quorum is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(QUORUM_LOST_MS + 31_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: READ_ONLY_MODE_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(quorumLossSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("structural strict-majority refusal below quorum is also eligible for an ACCEPTABLE-tier Finish", () => {
      const state = runScenario(QUORUM_LOST_MS + 31_000);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(quorumLossSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("unsafe writes without quorum are never eligible for any Finish tier, however healthy write availability reads", () => {
      const state = runScenario(QUORUM_LOST_MS + 5_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "relaxed-any-reachable" },
      ]);
      expect(state.values.writeAvailability).toBe(100);
      const eligibility = evaluateCompletionEligibility(quorumLossSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(QUORUM_THREATENED_MS + 31_000);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        quorumLossSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(QUORUM_LOST_MS + 31_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: READ_ONLY_MODE_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        quorumLossSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal (quorum held at edge) -> resolved/optimal", () => {
      const state = runScenario(QUORUM_THREATENED_MS + 31_000);
      const result = evaluateCandidateDeclaredFinish(quorumLossSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable (explicit read-only below quorum) -> resolved/acceptable", () => {
      const state = runScenario(QUORUM_LOST_MS + 31_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: READ_ONLY_MODE_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(quorumLossSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (relaxed quorum, writes accepted without majority) -> declared_unstable", () => {
      const state = runScenario(QUORUM_LOST_MS + 5_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "relaxed-any-reachable" },
      ]);
      const result = evaluateCandidateDeclaredFinish(quorumLossSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(QUORUM_LOST_MS + 61_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "relaxed-any-reachable" },
      ]);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(quorumLossSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    describe("Immediate-Finish audit", () => {
      it("zero-action Finish immediately after the incident starts does NOT resolve (quorum-threatened bar is not yet sustained)", () => {
        const state = runScenario(QUORUM_THREATENED_MS + 1_000);
        const eligibility = evaluateCompletionEligibility(quorumLossSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
        const result = evaluateCandidateDeclaredFinish(quorumLossSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("zero-action Finish stays ineligible until the full 30s sustain window has elapsed", () => {
        const state = runScenario(QUORUM_THREATENED_MS + 28_000);
        expect(state.transitions.consecutiveSuccessSeconds).toBeLessThan(30);
        const eligibility = evaluateCompletionEligibility(quorumLossSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: READ_ONLY_MODE_KEY, value: true },
      ];
      const runA = runScenario(QUORUM_LOST_MS + 10_000, actions);
      const runB = runScenario(QUORUM_LOST_MS + 10_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (membership-reconfigured), acceptable (read-only), baseline/unresolved, and harmful (unsafe writes) paths with coherent ordering", () => {
      const goodState = runScenario(QUORUM_LOST_MS + 31_000, [
        { atMs: QUORUM_THREATENED_MS + 10_000, controlKey: NODE_D_MEMBERSHIP_KEY, value: "isolated" },
        { atMs: QUORUM_THREATENED_MS + 11_000, controlKey: NODE_E_MEMBERSHIP_KEY, value: "isolated" },
        { atMs: QUORUM_THREATENED_MS + 12_000, controlKey: MEMBERSHIP_SIZE_KEY, value: "three" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(quorumLossSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        QUORUM_LOSS_SCORING,
        extractFinishScoringInputs(quorumLossSimulation, goodFinish),
      );

      const acceptableState = runScenario(QUORUM_LOST_MS + 31_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: READ_ONLY_MODE_KEY, value: true },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(quorumLossSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        QUORUM_LOSS_SCORING,
        extractFinishScoringInputs(quorumLossSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility (baseline
      // is never-resolved while above quorum/threatened only; here we
      // measure the unresolved harmful trap) — score via the unresolved
      // terminal override, no synthetic resolvedAtMs is ever fabricated.
      const baselineState = runScenario(QUORUM_THREATENED_MS + 5_000);
      const baselineScore = scoreAuthoredAttempt(
        QUORUM_LOSS_SCORING,
        extractScoringInputs(quorumLossSimulation, baselineState),
      );

      const harmfulState = runScenario(QUORUM_LOST_MS + 5_000, [
        { atMs: QUORUM_THREATENED_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "relaxed-any-reachable" },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        QUORUM_LOSS_SCORING,
        extractScoringInputs(quorumLossSimulation, harmfulState),
      );

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(harmfulScore.total);

      // Pin the actual executed numbers (section 17: investigate
      // suspicious outcomes, never assume ordering without reading real
      // output). This scenario's scoring was deliberately redesigned
      // (see scoring.ts's dataIntegrity penalty-mode comment) after an
      // initial authoring pass tied the unsafe-writes-accepted trap
      // with the merely-still-unresolved-but-safe baseline at 420 points
      // each — both reached the "unresolved" terminal override on
      // recovery/reliability and the same revenueLossUsd band, and the
      // original 2-band dataIntegrity measure only distinguished the
      // structural fix from "everything else," collapsing the trap and
      // the untouched baseline into the same lower band. The fix adds a
      // second, independent penalty specifically on
      // quorumSafetyMechanism === "unsafe-writes-accepted" (a value only
      // the trap state ever sets — the baseline keeps "unresolved"),
      // which now correctly separates "never violated correctness" from
      // "actively violated it."
      expect(goodScore.total).toBe(1000);
      expect(acceptableScore.total).toBe(725);
      expect(baselineScore.total).toBe(420);
      expect(harmfulScore.total).toBe(350);
    });

    it("immediate zero-action Finish scores clearly below both legitimate Finish outcomes", () => {
      const immediateState = runScenario(QUORUM_THREATENED_MS + 1_000);
      const immediateScore = scoreAuthoredAttempt(
        QUORUM_LOSS_SCORING,
        extractScoringInputs(quorumLossSimulation, immediateState),
      );

      const goodState = runScenario(QUORUM_LOST_MS + 31_000, [
        { atMs: QUORUM_THREATENED_MS + 10_000, controlKey: NODE_D_MEMBERSHIP_KEY, value: "isolated" },
        { atMs: QUORUM_THREATENED_MS + 11_000, controlKey: NODE_E_MEMBERSHIP_KEY, value: "isolated" },
        { atMs: QUORUM_THREATENED_MS + 12_000, controlKey: MEMBERSHIP_SIZE_KEY, value: "three" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(quorumLossSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        QUORUM_LOSS_SCORING,
        extractFinishScoringInputs(quorumLossSimulation, goodFinish),
      );

      expect(immediateScore.breakdown.recovery).toBe(0);
      expect(immediateScore.breakdown.reliability).toBe(0);
      expect(immediateScore.total).toBeLessThan(goodScore.total);
    });
  });
});
