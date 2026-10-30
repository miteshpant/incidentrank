import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { distributedCoordinationFailure } from "./distributed-coordination-failure";
import {
  distributedCoordinationFailureSimulation,
  FAILOVER_MODE_KEY,
  HEARTBEAT_INTERVAL_SECONDS_KEY,
  LEASE_DURATION_SECONDS_KEY,
  OWNERSHIP_FENCING_ENABLED_KEY,
  OWNERSHIP_RECONCILIATION_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./distributed-coordination-failure/definition";
import { distributedCoordinationFailureCandidateUI } from "./distributed-coordination-failure/candidate-ui";
import { DISTRIBUTED_COORDINATION_FAILURE_SCORING } from "./distributed-coordination-failure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(distributedCoordinationFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += distributedCoordinationFailureSimulation.tickMs
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
      distributedCoordinationFailureSimulation,
      state,
      action,
      distributedCoordinationFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const OWNERSHIP_STATE_STALE_MS = 30_000;
const STALENESS_WIDENS_MS = OWNERSHIP_STATE_STALE_MS + 3 * 60_000;

describe("Distributed Coordination Failure", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff scenario", () => {
      expect(distributedCoordinationFailure.isFree).toBe(false);
      expect(distributedCoordinationFailure.library?.category).toBe("Distributed Systems");
      expect(distributedCoordinationFailure.library?.tags.length).toBeGreaterThan(0);
      expect(distributedCoordinationFailure.library?.skills.length).toBeGreaterThan(0);
      expect(distributedCoordinationFailure.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = DISTRIBUTED_COORDINATION_FAILURE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = DISTRIBUTED_COORDINATION_FAILURE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(distributedCoordinationFailureCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(distributedCoordinationFailureCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(distributedCoordinationFailureCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(distributedCoordinationFailureCandidateUI.components.length).toBeGreaterThan(0);
    });

    it("is authored as automatic completion mode (no acceptable tier)", () => {
      expect(distributedCoordinationFailureSimulation.completion?.mode).toBe("automatic");
      expect(distributedCoordinationFailureSimulation.completion?.acceptableCondition).toBeUndefined();
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(distributedCoordinationFailureSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.ownershipConflictCount).toBe(0);
      expect(state.values.missedWorkItemCount).toBe(0);
      expect(state.values.ownershipIntegrityMode).toBe("unresolved");
    });

    it("the ownership-state-stale trigger fires the conservative baseline-orphaning incident", () => {
      const state = runScenario(OWNERSHIP_STATE_STALE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(OWNERSHIP_STATE_STALE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.missedWorkItemCount).toBe(35);
      expect(state.values.stalledWorkerCount).toBe(14);
      expect(state.values.schedulerBacklogCount).toBe(520);
      expect(state.values.coordinationServiceStatus).toBe("critical");
    });

    it("strong path: reconciliation + fencing together reach the fully safe, correctness-intact state", () => {
      const state = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: OWNERSHIP_RECONCILIATION_ENABLED_KEY, value: true },
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: OWNERSHIP_FENCING_ENABLED_KEY, value: true },
      ]);
      expect(state.values.ownershipConflictCount).toBe(0);
      expect(state.values.missedWorkItemCount).toBe(0);
      expect(state.values.duplicateWorkCompletedCount).toBe(0);
      expect(state.values.ownershipIntegrityMode).toBe("reconciled");
      expect(state.values.coordinationServiceStatus).toBe("normal");
    });

    it("alternate path: reconciliation alone leaves a real, nonzero residual duplicate-completion trickle", () => {
      const state = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: OWNERSHIP_RECONCILIATION_ENABLED_KEY, value: true },
      ]);
      expect(state.values.ownershipConflictCount).toBe(3);
      expect(state.values.missedWorkItemCount).toBe(2);
      expect(state.values.duplicateWorkCompletedCount).toBeGreaterThan(0);
      expect(state.values.ownershipIntegrityMode).toBe("reconciled-unfenced");
    });

    it("harmful path: aggressive failover without fencing causes mass duplicate ownership, worse than baseline", () => {
      const baseline = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000);
      const aggressive = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: FAILOVER_MODE_KEY, value: "aggressive" },
      ]);

      expect(aggressive.values.ownershipConflictCount).toBeGreaterThan(
        baseline.values.ownershipConflictCount as number,
      );
      expect(aggressive.values.duplicateWorkCompletedCount).toBeGreaterThan(
        baseline.values.duplicateWorkCompletedCount as number,
      );
      expect(aggressive.values.coordinationServiceStatus).toBe("critical");
    });

    it("harmful path is amplified further by raising worker concurrency on top of aggressive failover", () => {
      const aggressive = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: FAILOVER_MODE_KEY, value: "aggressive" },
      ]);
      const aggressiveHighConcurrency = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: FAILOVER_MODE_KEY, value: "aggressive" },
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
      ]);

      expect(aggressiveHighConcurrency.values.duplicateWorkCompletedCount).toBeGreaterThan(
        aggressive.values.duplicateWorkCompletedCount as number,
      );
    });

    it("trap path: a faster heartbeat alone has no durable effect on the baseline orphaning state", () => {
      const baseline = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000);
      const fasterHeartbeat = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: HEARTBEAT_INTERVAL_SECONDS_KEY, value: 5 },
      ]);

      // "Essentially unchanged" — authored as a near-identical, not
      // bit-for-bit identical, state versus baseline: a faster
      // heartbeat alone does not touch the ownership table's own
      // staleness, so the failure stays just as critical.
      expect(fasterHeartbeat.values.missedWorkItemCount).toBe(33);
      expect(baseline.values.missedWorkItemCount).toBe(35);
      expect(fasterHeartbeat.values.coordinationServiceStatus).toBe("critical");
      expect(fasterHeartbeat.values.ownershipIntegrityMode).toBe("unresolved");
    });

    it("partial relief: a short lease reduces but does not eliminate the orphaning problem", () => {
      const baseline = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000);
      const shortLease = runScenario(OWNERSHIP_STATE_STALE_MS + 20_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: LEASE_DURATION_SECONDS_KEY, value: 10 },
      ]);

      expect(shortLease.values.missedWorkItemCount).toBeLessThan(baseline.values.missedWorkItemCount as number);
      expect(shortLease.values.missedWorkItemCount).toBeGreaterThan(0);
      expect(shortLease.values.ownershipIntegrityMode).toBe("unresolved");
    });

    it("delayed consequence: unmitigated staleness widens further at the second-wave timer, with a visible precursor already climbing", () => {
      const beforeWiden = runScenario(STALENESS_WIDENS_MS - 1_000);
      const afterWiden = runScenario(STALENESS_WIDENS_MS + 1_000);

      // Precursor: backlog/missed-work were already climbing before the
      // second wave — never a surprise flip from a healthy-looking state.
      expect(beforeWiden.values.schedulerBacklogCount).toBe(520);
      expect(beforeWiden.values.missedWorkItemCount).toBe(35);

      expect(afterWiden.values.schedulerBacklogCount).toBe(900);
      expect(afterWiden.values.missedWorkItemCount).toBe(70);
      expect(afterWiden.values.schedulerBacklogCount).toBeGreaterThan(
        beforeWiden.values.schedulerBacklogCount as number,
      );
    });

    it("stays active (never auto-fails) even after the unmitigated backlog sustains past the old threshold", () => {
      const state = runScenario(STALENESS_WIDENS_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(60);
    });

    it("zero-action immediate stop never resolves — automatic mode requires a real authored fix", () => {
      const state = runScenario(OWNERSHIP_STATE_STALE_MS + 1_000);
      expect(state.status).not.toBe("resolved");
      expect(state.transitions.consecutiveSuccessSeconds).toBe(0);
    });
  });

  describe("Scoring", () => {
    it("scores the fully safe reconciled+fenced path highest among all executed paths", () => {
      const optimal = runScenario(OWNERSHIP_STATE_STALE_MS + 35_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: OWNERSHIP_RECONCILIATION_ENABLED_KEY, value: true },
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: OWNERSHIP_FENCING_ENABLED_KEY, value: true },
      ]);
      const baseline = runScenario(OWNERSHIP_STATE_STALE_MS + 35_000);
      const harmful = runScenario(OWNERSHIP_STATE_STALE_MS + 35_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: FAILOVER_MODE_KEY, value: "aggressive" },
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
      ]);
      const alternateGood = runScenario(OWNERSHIP_STATE_STALE_MS + 35_000, [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: OWNERSHIP_RECONCILIATION_ENABLED_KEY, value: true },
      ]);

      // The engine itself never auto-writes "resolved" (Phase 7.1
      // doctrine) — the optimal path must be scored via its Finish
      // declaration, never a raw extractScoringInputs call on the
      // unresolved state, which would incorrectly zero out recovery/
      // reliability's terminalOverrides.
      const optimalFinish = evaluateCandidateDeclaredFinish(
        distributedCoordinationFailureSimulation,
        optimal,
      );
      expect(optimalFinish.outcome).toBe("resolved");
      const optimalScore = scoreAuthoredAttempt(
        DISTRIBUTED_COORDINATION_FAILURE_SCORING,
        extractFinishScoringInputs(distributedCoordinationFailureSimulation, optimalFinish),
      );
      const baselineScore = scoreAuthoredAttempt(
        DISTRIBUTED_COORDINATION_FAILURE_SCORING,
        extractScoringInputs(distributedCoordinationFailureSimulation, baseline),
      );
      const harmfulScore = scoreAuthoredAttempt(
        DISTRIBUTED_COORDINATION_FAILURE_SCORING,
        extractScoringInputs(distributedCoordinationFailureSimulation, harmful),
      );
      const alternateGoodScore = scoreAuthoredAttempt(
        DISTRIBUTED_COORDINATION_FAILURE_SCORING,
        extractScoringInputs(distributedCoordinationFailureSimulation, alternateGood),
      );

      expect(optimalScore.total).toBeGreaterThan(alternateGoodScore.total);
      expect(alternateGoodScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(harmfulScore.total);

      // Record the actual executed numbers (regression guard against
      // silent future drift in rules/scoring/extraction). optimalScore
      // is 865, not 1000: deriveScoringResolvedAtMs credits the INSTANT
      // the success condition first became continuously true (one
      // second after incident start in this fixture), not the moment
      // its sustain window finished — recoveryTimeSeconds is excellent
      // (top band, 300/300), but totalTimeInCriticalMs (accumulated
      // before the fix took effect) measured against that same short
      // resolved window drives criticalTimeRatio into the worst
      // reliability band (15/150 instead of 150/150). Same mechanism as
      // autoscaling-failure.test.ts's equivalent note.
      expect(optimalScore.total).toBe(865);
      expect(baselineScore.total).toBe(390);
      expect(harmfulScore.total).toBe(280);
      expect(alternateGoodScore.total).toBe(490);

      // dataIntegrity specifically must discriminate three real tiers
      // (fully reconciled > exactly one mechanism applied > neither),
      // never tie a genuine partial fix with doing nothing.
      expect(optimalScore.breakdown.dataIntegrity).toBe(200);
      expect(alternateGoodScore.breakdown.dataIntegrity).toBe(140);
      expect(baselineScore.breakdown.dataIntegrity).toBe(40);
      expect(harmfulScore.breakdown.dataIntegrity).toBe(40);
    });
  });

  describe("Determinism", () => {
    it("identical actions + elapsed time produce identical state", () => {
      const actions: TimedAction[] = [
        { atMs: OWNERSHIP_STATE_STALE_MS + 1_000, controlKey: OWNERSHIP_RECONCILIATION_ENABLED_KEY, value: true },
        { atMs: OWNERSHIP_STATE_STALE_MS + 2_000, controlKey: OWNERSHIP_FENCING_ENABLED_KEY, value: true },
      ];
      const first = runScenario(OWNERSHIP_STATE_STALE_MS + 40_000, actions);
      const second = runScenario(OWNERSHIP_STATE_STALE_MS + 40_000, actions);
      expect(first).toEqual(second);
    });
  });
});
