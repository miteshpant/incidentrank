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
import { splitBrainIncident } from "./split-brain-incident";
import {
  FENCING_ACTION_KEY,
  QUORUM_REQUIREMENT_KEY,
  RECONCILIATION_POLICY_KEY,
  REGION_A_ACCESS_KEY,
  REGION_B_ACCESS_KEY,
  splitBrainIncidentSimulation,
} from "./split-brain-incident/definition";
import { splitBrainIncidentCandidateUI } from "./split-brain-incident/candidate-ui";
import { SPLIT_BRAIN_INCIDENT_SCORING } from "./split-brain-incident/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(splitBrainIncidentSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += splitBrainIncidentSimulation.tickMs
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
      splitBrainIncidentSimulation,
      state,
      action,
      splitBrainIncidentSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const NETWORK_PARTITION_MS = 30_000;
const NETWORK_HEALED_MS = NETWORK_PARTITION_MS + 4 * 60_000;

describe("Split-Brain Incident", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff scenario", () => {
      expect(splitBrainIncident.isFree).toBe(false);
      expect(splitBrainIncident.library?.category).toBe("Distributed Systems");
      expect(splitBrainIncident.library?.tags.length).toBeGreaterThan(0);
      expect(splitBrainIncident.library?.skills.length).toBeGreaterThan(0);
      expect(splitBrainIncident.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = SPLIT_BRAIN_INCIDENT_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = SPLIT_BRAIN_INCIDENT_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(splitBrainIncidentCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(splitBrainIncidentCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(splitBrainIncidentCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(splitBrainIncidentSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.leaderCount).toBe(1);
      expect(state.values.writeAuthorityState).toBe("single");
      expect(state.values.writeSafetyMechanism).toBe("unresolved");
    });

    it("network partition triggers the incident; default config (no mitigation) goes critical with dual leadership", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(NETWORK_PARTITION_MS);
      expect(state.status).toBe("critical");
      expect(state.values.leaderCount).toBe(2);
      expect(state.values.writeAuthorityState).toBe("dual");
      expect(state.values.conflictCount).toBeGreaterThan(0);
    });

    it("strong path: enforcing majority quorum restores a single writer without any manual fencing", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "majority" },
      ]);
      expect(state.values.writeAuthorityState).toBe("single");
      expect(state.values.conflictCount).toBe(0);
      expect(state.values.writeSafetyMechanism).toBe("quorum-enforced");
      expect(state.values.leaderCount).toBe(1);
    });

    it("alternate good path: explicitly fencing the non-majority region (B) also reaches a single safe writer", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: FENCING_ACTION_KEY, value: "fence-region-b" },
      ]);
      expect(state.values.writeAuthorityState).toBe("single");
      expect(state.values.conflictCount).toBe(0);
      expect(state.values.writeSafetyMechanism).toBe("fenced-correct");
      expect(state.values.regionAWriteAvailability).toBe(100);
      expect(state.values.regionBWriteAvailability).toBe(0);
    });

    it("alternate good path: manually isolating Region B (read-only) while Region A stays read-write also reaches a safe single writer", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: REGION_B_ACCESS_KEY, value: "read-only" },
      ]);
      expect(state.values.writeAuthorityState).toBe("single");
      expect(state.values.conflictCount).toBe(0);
      expect(state.values.writeSafetyMechanism).toBe("manual-isolation");
    });

    it("harmful path: fencing the wrong region (A, the structurally majority side) is safe but sacrifices the side that could have stayed up", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: FENCING_ACTION_KEY, value: "fence-region-a" },
      ]);
      expect(state.values.writeAuthorityState).toBe("single");
      expect(state.values.conflictCount).toBe(0);
      expect(state.values.writeSafetyMechanism).toBe("fenced-wrong");
      expect(state.values.regionAWriteAvailability).toBe(0);
      expect(state.values.regionBWriteAvailability).toBe(100);
    });

    it("overly conservative path: isolating both regions is safe but sacrifices all write availability", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: REGION_A_ACCESS_KEY, value: "offline" },
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: REGION_B_ACCESS_KEY, value: "offline" },
      ]);
      expect(state.values.writeAuthorityState).toBe("single");
      expect(state.values.conflictCount).toBe(0);
      expect(state.values.writeSafetyMechanism).toBe("both-isolated");
      expect(state.values.regionAWriteAvailability).toBe(0);
      expect(state.values.regionBWriteAvailability).toBe(0);
    });

    it("baseline (no action) stays critical and never self-resolves (before the sustained failure window elapses)", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 30_000);
      expect(state.status).toBe("critical");
      expect(state.values.writeAuthorityState).toBe("dual");
    });

    it("delayed consequence: network healing occurs on a second wave, with observable dual-leadership/conflict precursors already visible beforehand", () => {
      const beforeHeal = runScenario(NETWORK_PARTITION_MS + 10_000);
      // Observable precursors already visible before healing.
      expect(beforeHeal.values.leaderCount).toBe(2);
      expect(beforeHeal.values.conflictCount).toBeGreaterThan(0);

      const afterHeal = runScenario(NETWORK_HEALED_MS + 5_000);
      expect(afterHeal.values.partitionState).toBe("healed");
    });

    it("stays active (never auto-fails) even after dual leadership with real conflicts persists past the old sustained window", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        splitBrainIncidentSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak conflict count and peak leader count generically via numericWatchFields", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 1_000);
      expect(state.peaks.peakValues.conflictCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.leaderCount).toBe(2);
    });

    describe("Post-heal reconciliation", () => {
      it("defer-until-healed leaves a real, counted backlog of unreconciled writes after healing", () => {
        const state = runScenario(NETWORK_HEALED_MS + 5_000);
        expect(state.values.partitionState).toBe("healed");
        expect(state.values.conflictCount).toBeGreaterThan(0);
        expect(state.values.unreconciledWriteCount).toBeGreaterThan(0);
      });

      it("last-write-wins resolves the backlog immediately once healed", () => {
        const state = runScenario(NETWORK_HEALED_MS + 5_000, [
          { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: RECONCILIATION_POLICY_KEY, value: "last-write-wins" },
        ]);
        expect(state.values.partitionState).toBe("healed");
        expect(state.values.conflictCount).toBe(0);
        expect(state.values.unreconciledWriteCount).toBe(0);
      });

      it("manual-review leaves conflicts visibly unresolved until a human reviews them", () => {
        const state = runScenario(NETWORK_HEALED_MS + 5_000, [
          { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: RECONCILIATION_POLICY_KEY, value: "manual-review" },
        ]);
        expect(state.values.partitionState).toBe("healed");
        expect(state.values.conflictCount).toBeGreaterThan(0);
      });
    });

    describe("Correctness violation is real even when availability looks fully healthy (the trap)", () => {
      it("both regions writable: availability reads 100/100 in both regions while conflictCount and leaderCount are actively, visibly unsafe", () => {
        const state = runScenario(NETWORK_PARTITION_MS + 20_000);

        // The dangerous combination: customer-facing availability looks
        // perfect in BOTH regions at once...
        expect(state.values.regionAWriteAvailability).toBe(100);
        expect(state.values.regionBWriteAvailability).toBe(100);

        // ...while the real, observable correctness fields say the
        // opposite: two simultaneous leaders and unresolved conflicts.
        expect(state.values.leaderCount).toBe(2);
        expect(state.values.writeAuthorityState).toBe("dual");
        expect(state.values.conflictCount).toBeGreaterThan(0);
        expect(state.values.divergentWriteCount).toBeGreaterThan(0);

        // This must never satisfy successCondition, no matter how
        // healthy availability looks.
        const eligibility = evaluateCompletionEligibility(splitBrainIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("Finish from the both-regions-writable trap -> declared_unstable, not resolved", () => {
        const state = runScenario(NETWORK_PARTITION_MS + 20_000);
        const result = evaluateCandidateDeclaredFinish(splitBrainIncidentSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
        expect(result.completionTier).toBeNull();
      });

      it("even with an explicit acceptable-tier absence, no control combination that keeps both regions read-write during the partition (other than majority quorum) is ever eligible", () => {
        const state = runScenario(NETWORK_PARTITION_MS + 20_000, [
          { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "any-single-region" },
        ]);
        expect(state.values.writeAuthorityState).toBe("dual");
        const eligibility = evaluateCompletionEligibility(splitBrainIncidentSimulation, state);
        expect(eligibility.eligible).toBe(false);
      });
    });
  });

  describe("Completion mode: candidate_declared, single-tier (no acceptableCondition)", () => {
    it("quorum-enforced success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "majority" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        splitBrainIncidentSimulation.successCondition.sustainedSeconds,
      );
    });

    it("fenced-correct success is also eligible (optimal tier, since there is no acceptableCondition)", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: FENCING_ACTION_KEY, value: "fence-region-b" },
      ]);
      const eligibility = evaluateCompletionEligibility(splitBrainIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Finish from quorum-enforced -> resolved/optimal", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "majority" },
      ]);
      const result = evaluateCandidateDeclaredFinish(splitBrainIncidentSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(splitBrainIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("never auto-fails regardless of candidate_declared mode, even past the old sustained window", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        splitBrainIncidentSimulation.failureCondition.sustainedSeconds,
      );
      const result = evaluateCandidateDeclaredFinish(splitBrainIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "majority" },
      ];
      const runA = runScenario(NETWORK_PARTITION_MS + 20_000, actions);
      const runB = runScenario(NETWORK_PARTITION_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (quorum), alternate-good (fenced-correct), baseline, harmful (wrong-region fence), and the available-but-corrupt trap with coherent Data Integrity discrimination", () => {
      const quorumState = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "majority" },
      ]);
      const quorumFinish = evaluateCandidateDeclaredFinish(splitBrainIncidentSimulation, quorumState);
      const quorumScore = scoreAuthoredAttempt(
        SPLIT_BRAIN_INCIDENT_SCORING,
        extractFinishScoringInputs(splitBrainIncidentSimulation, quorumFinish),
      );

      const fencedState = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: FENCING_ACTION_KEY, value: "fence-region-b" },
      ]);
      const fencedFinish = evaluateCandidateDeclaredFinish(splitBrainIncidentSimulation, fencedState);
      const fencedScore = scoreAuthoredAttempt(
        SPLIT_BRAIN_INCIDENT_SCORING,
        extractFinishScoringInputs(splitBrainIncidentSimulation, fencedFinish),
      );

      // Never-resolved attempts are scored via the unresolved terminal
      // override -- no synthetic resolvedAtMs is ever fabricated for
      // baseline or the available-but-corrupt trap, since neither is
      // Finish-eligible.
      const baselineState = runScenario(NETWORK_PARTITION_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        SPLIT_BRAIN_INCIDENT_SCORING,
        extractScoringInputs(splitBrainIncidentSimulation, baselineState),
      );

      const wrongFenceState = runScenario(NETWORK_PARTITION_MS + 20_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: FENCING_ACTION_KEY, value: "fence-region-a" },
      ]);
      const wrongFenceFinish = evaluateCandidateDeclaredFinish(splitBrainIncidentSimulation, wrongFenceState);
      const wrongFenceScore = scoreAuthoredAttempt(
        SPLIT_BRAIN_INCIDENT_SCORING,
        extractFinishScoringInputs(splitBrainIncidentSimulation, wrongFenceFinish),
      );

      const availableButCorruptState = baselineState; // both regions writable, availability 100/100
      const availableButCorruptScore = scoreAuthoredAttempt(
        SPLIT_BRAIN_INCIDENT_SCORING,
        extractScoringInputs(splitBrainIncidentSimulation, availableButCorruptState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(quorumScore.total).toBe(865);
      expect(fencedScore.total).toBe(725);
      expect(baselineScore.total).toBe(410);
      expect(wrongFenceScore.total).toBe(710);
      expect(availableButCorruptScore.total).toBe(410);

      // The central assertion for this batch: Data Integrity must be
      // measurably lower for the available-but-corrupt dual-leader
      // state (never Finish-eligible, scored via the unresolved
      // terminal override on every OTHER dimension) than for the
      // genuinely optimal, quorum-enforced, Finish-eligible state --
      // even though the trap's customer-facing availability metrics
      // read as fully healthy in both regions.
      expect(quorumScore.breakdown.dataIntegrity).toBe(200);
      expect(availableButCorruptScore.breakdown.dataIntegrity).toBe(60);
      expect(quorumScore.breakdown.dataIntegrity).toBeGreaterThan(
        availableButCorruptScore.breakdown.dataIntegrity,
      );

      // Fencing the correct region is also genuinely safe right now and
      // equally Finish-eligible, but it scores lower on Data Integrity
      // than the structural quorum fix, since it is not backed by a
      // structural guarantee against a future partition.
      expect(fencedScore.breakdown.dataIntegrity).toBe(60);
      expect(quorumScore.total).toBeGreaterThan(fencedScore.total);

      // Fencing the WRONG region is also Finish-eligible (zero conflicts,
      // single writer) and scores the same Data Integrity band as the
      // correct fence and the dual-leader trap, but it is penalized on
      // Operational Efficiency for the harmful wrong-region fencing
      // action itself (acr_4), which is what pulls its total below the
      // correct fence despite tying on every other dimension.
      expect(wrongFenceScore.breakdown.dataIntegrity).toBe(60);
      expect(wrongFenceScore.breakdown.operationalEfficiency).toBeLessThan(
        fencedScore.breakdown.operationalEfficiency,
      );

      expect(quorumScore.total).toBeGreaterThan(baselineScore.total);

      // Known generic-scorer characteristic (phase6b.md section 17,
      // already accepted for Distributed Lock Failure): a
      // candidate_declared Finish's scoringResolvedAtMs is derived from
      // the moment the success condition became sustained-true, which
      // can be a very short window relative to critical time already
      // accrued just before the fix landed -- criticalTimeRatio can
      // exceed 1 and land in the lowest reliability band even for a
      // genuinely optimal, fast resolution. This is a known, documented
      // limitation of the shared scorer, not something to special-case
      // per scenario; Data Integrity (not Reliability) is the dimension
      // this scenario relies on to discriminate the trap from the fix.
      expect(quorumScore.breakdown.reliability).toBe(15);
      expect(fencedScore.breakdown.reliability).toBe(15);
    });
  });
});
