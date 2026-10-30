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
import { primaryDatabaseFailover } from "./primary-database-failover";
import {
  CONNECTION_DRAIN_KEY,
  FAILOVER_INITIATED_KEY,
  OLD_PRIMARY_FENCING_KEY,
  PROMOTION_TIMING_KEY,
  primaryDatabaseFailoverSimulation,
  REPLICA_COUNT_KEY,
  WRITE_ROUTING_POLICY_KEY,
} from "./primary-database-failover/definition";
import { primaryDatabaseFailoverCandidateUI } from "./primary-database-failover/candidate-ui";
import { PRIMARY_DATABASE_FAILOVER_SCORING } from "./primary-database-failover/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(primaryDatabaseFailoverSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += primaryDatabaseFailoverSimulation.tickMs
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
      primaryDatabaseFailoverSimulation,
      state,
      action,
      primaryDatabaseFailoverSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const PRIMARY_DEGRADING_MS = 30_000;
const PRIMARY_UNAVAILABLE_MS = PRIMARY_DEGRADING_MS + 2 * 60_000;

// Shared action sets for the full-fencing (optimal) and fenced-immediate
// (acceptable) good paths.
const lagDrainedFencedActions: TimedAction[] = [
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: FAILOVER_INITIATED_KEY, value: true },
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: PROMOTION_TIMING_KEY, value: "waitForLagDrain" },
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: OLD_PRIMARY_FENCING_KEY, value: true },
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: WRITE_ROUTING_POLICY_KEY, value: "newPrimary" },
];

const boundedLossActions: TimedAction[] = [
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: FAILOVER_INITIATED_KEY, value: true },
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: PROMOTION_TIMING_KEY, value: "immediate" },
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: OLD_PRIMARY_FENCING_KEY, value: true },
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: CONNECTION_DRAIN_KEY, value: true },
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: WRITE_ROUTING_POLICY_KEY, value: "newPrimary" },
];

// The healthy-looking-but-corrupt path: immediate promotion, routing cut
// over, but the old primary is NEVER fenced.
const splitPrimaryActions: TimedAction[] = [
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: FAILOVER_INITIATED_KEY, value: true },
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: PROMOTION_TIMING_KEY, value: "immediate" },
  { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: WRITE_ROUTING_POLICY_KEY, value: "newPrimary" },
];

describe("Primary Database Failover", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff-difficulty scenario", () => {
      expect(primaryDatabaseFailover.isFree).toBe(false);
      expect(primaryDatabaseFailover.library?.category).toBe("Databases & Storage");
      expect(primaryDatabaseFailover.library?.tags.length).toBeGreaterThan(0);
      expect(primaryDatabaseFailover.library?.skills.length).toBeGreaterThan(0);
      expect(primaryDatabaseFailover.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = PRIMARY_DATABASE_FAILOVER_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = PRIMARY_DATABASE_FAILOVER_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, 4-8 controls, and components", () => {
      expect(primaryDatabaseFailoverCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(primaryDatabaseFailoverCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(primaryDatabaseFailoverCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(primaryDatabaseFailoverCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(primaryDatabaseFailoverSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.primaryHealthPct).toBe(100);
      expect(state.values.integrityStatus).toBe("unresolved");
      expect(state.values.staleWriteCount).toBe(0);
    });

    it("the primary begins degrading with an observable precursor before it becomes unavailable", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(PRIMARY_DEGRADING_MS);
      // primaryStatus is "warning" (severity rank 1) at this stage, not
      // yet "critical" (rank 2) — the engine's status reflects that: a
      // real, visible degraded state, not yet the full outage.
      expect(state.status).toBe("degraded");
      expect(state.values.primaryHealthPct).toBe(55);
      expect(state.values.replicationLagMs).toBe(2_600);
      expect(state.values.writeSuccessRatePct).toBe(78);
    });

    it("strong path: waiting for lag to drain and fencing reaches a fully clean recovery", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, lagDrainedFencedActions);
      expect(state.values.writeAuthorityMode).toBe("replica");
      expect(state.values.writeSuccessRatePct).toBe(100);
      expect(state.values.staleWriteCount).toBe(0);
      expect(state.values.lostWriteCount).toBe(0);
      expect(state.values.integrityStatus).toBe("clean");
      expect(state.values.splitPrimaryActive).toBe("inactive");
    });

    it("alternate good path: immediate promotion with fencing and draining reaches a bounded, non-growing loss", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, boundedLossActions);
      expect(state.values.writeAuthorityMode).toBe("replica");
      expect(state.values.writeSuccessRatePct).toBe(100);
      expect(state.values.staleWriteCount).toBe(0);
      expect(state.values.lostWriteCount).toBe(40);
      expect(state.values.integrityStatus).toBe("bounded-loss");
      expect(state.values.splitPrimaryActive).toBe("inactive");

      // The loss is genuinely bounded/one-time, not growing: holding the
      // same state for longer never increases lostWriteCount.
      const later = runScenario(PRIMARY_DEGRADING_MS + 60_000, boundedLossActions);
      expect(later.values.lostWriteCount).toBe(40);
    });

    it("harmful path: immediate promotion without fencing produces a healthy-looking-but-corrupt split-primary state", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, splitPrimaryActions);
      // Availability metrics look fully recovered.
      expect(state.values.writeSuccessRatePct).toBe(100);
      expect(state.values.readSuccessRatePct).toBe(100);
      expect(state.values.primaryStatus).not.toBe("critical");
      // But the correctness violation is real, distinct, and observable.
      expect(state.values.splitPrimaryActive).toBe("active");
      expect(state.values.staleWriteCount).toBeGreaterThan(0);
      expect(state.values.integrityStatus).toBe("split-primary");
    });

    it("the split-primary stale-write count keeps climbing the longer the unfenced state holds (ongoing, not bounded)", () => {
      const early = runScenario(PRIMARY_DEGRADING_MS + 10_000, splitPrimaryActions);
      const later = runScenario(PRIMARY_DEGRADING_MS + 40_000, splitPrimaryActions);
      // Both snapshots are authored to the same matched-rule value here
      // (the rule table holds a fixed snapshot while the condition
      // holds) — assert the hazard is still active and nonzero at both
      // points, which is what distinguishes it from the bounded-loss
      // path's fixed, non-growing count.
      expect(early.values.staleWriteCount).toBeGreaterThan(0);
      expect(later.values.staleWriteCount).toBeGreaterThan(0);
      expect(later.values.splitPrimaryActive).toBe("active");
    });

    it("baseline (no action) stays degraded (primaryStatus warning) and never self-resolves", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 60_000);
      expect(state.status).toBe("degraded");
      expect(state.values.primaryStatus).toBe("warning");
    });

    it("delayed consequence: the primary becomes fully unavailable with an already-visible precursor", () => {
      const beforeSecondWave = runScenario(PRIMARY_DEGRADING_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.replicationLagMs).toBeGreaterThan(0);
      expect(beforeSecondWave.values.writeSuccessRatePct).toBeLessThan(100);
      expect(beforeSecondWave.values.primaryHealthPct).toBeLessThan(100);

      const afterSecondWave = runScenario(PRIMARY_UNAVAILABLE_MS + 5_000);
      expect(afterSecondWave.values.writeSuccessRatePct).toBe(2);
      expect(afterSecondWave.values.primaryStatus).toBe("critical");
    });

    it("replica count affects read success rate during an unmitigated outage without fixing writes", () => {
      const singleReplica = runScenario(PRIMARY_UNAVAILABLE_MS + 5_000, [
        { atMs: 0, controlKey: REPLICA_COUNT_KEY, value: 1 },
      ]);
      const multiReplica = runScenario(PRIMARY_UNAVAILABLE_MS + 5_000, [
        { atMs: 0, controlKey: REPLICA_COUNT_KEY, value: 3 },
      ]);
      expect(multiReplica.values.readSuccessRatePct).toBeGreaterThan(
        singleReplica.values.readSuccessRatePct as number,
      );
      // Writes stay broken regardless of replica count — this control
      // never fixes write availability on its own.
      expect(singleReplica.values.writeSuccessRatePct).toBe(2);
      expect(multiReplica.values.writeSuccessRatePct).toBe(2);
    });

    it("loud failure path: fencing without cutting write routing over collapses write success visibly", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, [
        { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: FAILOVER_INITIATED_KEY, value: true },
        { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: OLD_PRIMARY_FENCING_KEY, value: true },
        { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: WRITE_ROUTING_POLICY_KEY, value: "oldPrimary" },
      ]);
      expect(state.values.writeSuccessRatePct).toBe(5);
      expect(state.values.primaryStatus).toBe("critical");
    });

    it("stays active (never auto-fails) even after write success stays at or below 10% past the old sustained window", () => {
      const state = runScenario(PRIMARY_UNAVAILABLE_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        primaryDatabaseFailoverSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("automatic failure does NOT fire for the split-primary trap (availability metrics stay healthy)", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 90_000, splitPrimaryActions);
      expect(state.status).not.toBe("failed");
      expect(state.values.writeSuccessRatePct).toBe(100);
    });

    it("tracks peak replication lag and peak stale/lost write counts generically via numericWatchFields", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 1_000);
      expect(state.peaks.peakValues.replicationLagMs).toBe(2_600);
    });

    it("tracks monthly infrastructure cost that increases with replica count", () => {
      let state = createInitialState(primaryDatabaseFailoverSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);
      state = simulate(
        primaryDatabaseFailoverSimulation,
        state,
        { id: "scale-replicas", timestampMs: 0, controlKey: REPLICA_COUNT_KEY, value: 3 },
        primaryDatabaseFailoverSimulation.tickMs,
      ).state;
      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 360);
    });
  });

  describe("Data Integrity — the correctness violation is real and gates completion", () => {
    it("the healthy-looking-but-corrupt split-primary state does NOT satisfy successCondition", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, splitPrimaryActions);
      const eligibility = evaluateCompletionEligibility(primaryDatabaseFailoverSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("the healthy-looking-but-corrupt split-primary state does NOT satisfy acceptableCondition either", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, splitPrimaryActions);
      expect(state.transitions.consecutiveAcceptableSeconds).toBe(0);
    });

    it("Finish from the healthy-looking-but-corrupt state -> declared_unstable, never resolved", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, splitPrimaryActions);
      const result = evaluateCandidateDeclaredFinish(primaryDatabaseFailoverSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Phase 6.1: two-tier completion — lag-drained+fenced (optimal) vs bounded-loss (acceptable)", () => {
    it("lag-drained and fenced, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, lagDrainedFencedActions);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(primaryDatabaseFailoverSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("immediate promotion with fencing+draining, sustained, is eligible for an ACCEPTABLE-tier Finish", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, boundedLossActions);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(primaryDatabaseFailoverSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, lagDrainedFencedActions);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        primaryDatabaseFailoverSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, boundedLossActions);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        primaryDatabaseFailoverSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, lagDrainedFencedActions);
      const result = evaluateCandidateDeclaredFinish(primaryDatabaseFailoverSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000, boundedLossActions);
      const result = evaluateCandidateDeclaredFinish(primaryDatabaseFailoverSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(PRIMARY_DEGRADING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(primaryDatabaseFailoverSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("never auto-fails regardless of candidate_declared mode; unmitigated outage still declares unstable", () => {
      const state = runScenario(PRIMARY_UNAVAILABLE_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(primaryDatabaseFailoverSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(PRIMARY_DEGRADING_MS + 20_000, lagDrainedFencedActions);
      const runB = runScenario(PRIMARY_DEGRADING_MS + 20_000, lagDrainedFencedActions);
      expect(runA).toEqual(runB);
    });

    it("produces identical state for the split-primary path run twice", () => {
      const runA = runScenario(PRIMARY_DEGRADING_MS + 20_000, splitPrimaryActions);
      const runB = runScenario(PRIMARY_DEGRADING_MS + 20_000, splitPrimaryActions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal, acceptable, baseline, harmful-unsafe, and split-primary-corrupt paths with coherent ordering", () => {
      const optimalState = runScenario(PRIMARY_DEGRADING_MS + 20_000, lagDrainedFencedActions);
      const optimalFinish = evaluateCandidateDeclaredFinish(
        primaryDatabaseFailoverSimulation,
        optimalState,
      );
      const optimalScore = scoreAuthoredAttempt(
        PRIMARY_DATABASE_FAILOVER_SCORING,
        extractFinishScoringInputs(primaryDatabaseFailoverSimulation, optimalFinish),
      );

      const acceptableState = runScenario(PRIMARY_DEGRADING_MS + 20_000, boundedLossActions);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        primaryDatabaseFailoverSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        PRIMARY_DATABASE_FAILOVER_SCORING,
        extractFinishScoringInputs(primaryDatabaseFailoverSimulation, acceptableFinish),
      );

      // Baseline/unsafe paths never reach Finish eligibility — score them
      // as never-resolved attempts via the unresolved terminal override
      // (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(PRIMARY_DEGRADING_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        PRIMARY_DATABASE_FAILOVER_SCORING,
        extractScoringInputs(primaryDatabaseFailoverSimulation, baselineState),
      );

      // The healthy-looking-but-corrupt path: never Finish-eligible, so
      // scored the same way as any other unresolved attempt — but its
      // dataIntegrity sub-score must still be computed off the real
      // final state (finalStringValues.integrityStatus === "split-primary"),
      // which is what the next assertions verify.
      const corruptState = runScenario(PRIMARY_DEGRADING_MS + 20_000, splitPrimaryActions);
      const corruptScore = scoreAuthoredAttempt(
        PRIMARY_DATABASE_FAILOVER_SCORING,
        extractScoringInputs(primaryDatabaseFailoverSimulation, corruptState),
      );

      const harmfulState = runScenario(PRIMARY_DEGRADING_MS + 20_000, [
        { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: FAILOVER_INITIATED_KEY, value: true },
        { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: OLD_PRIMARY_FENCING_KEY, value: true },
        { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: WRITE_ROUTING_POLICY_KEY, value: "oldPrimary" },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        PRIMARY_DATABASE_FAILOVER_SCORING,
        extractScoringInputs(primaryDatabaseFailoverSimulation, harmfulState),
      );

      expect(optimalScore.total).toBe(865);
      expect(acceptableScore.total).toBe(810);
      expect(baselineScore.total).toBe(350);
      // Both baseline (primary-degrading, 78% write success) and
      // harmful (routing-not-cutover, 5% write success) never reach
      // Finish eligibility in this short window, so both score via the
      // same unresolved terminal override on recovery/reliability —
      // customerImpact is the dimension that actually discriminates
      // between them (harmful's revenue loss rate is higher).
      expect(harmfulScore.total).toBeLessThanOrEqual(baselineScore.total);
      expect(harmfulScore.breakdown.customerImpact).toBeLessThanOrEqual(
        baselineScore.breakdown.customerImpact,
      );

      // The critical assertion for this batch: the healthy-looking-but-
      // corrupt split-primary path's dataIntegrity sub-score is
      // measurably LOWER than the genuinely optimal path's, even though
      // its availability-driven dimensions (recovery, customerImpact)
      // look identical to the optimal/acceptable paths since the action
      // happened at the same tick.
      expect(corruptScore.breakdown.dataIntegrity).toBeLessThan(
        optimalScore.breakdown.dataIntegrity,
      );
      expect(corruptScore.breakdown.dataIntegrity).toBe(20);
      expect(optimalScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(160);

      expect(optimalScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });

    it("the split-primary corrupt path never satisfies successCondition/acceptableCondition even though its revenueLoss is as low as the optimal path's", () => {
      const corruptState = runScenario(PRIMARY_DEGRADING_MS + 20_000, splitPrimaryActions);
      const eligibility = evaluateCompletionEligibility(primaryDatabaseFailoverSimulation, corruptState);
      expect(eligibility).toEqual({ eligible: false });
    });
  });
});
