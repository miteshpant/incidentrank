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
import { multiTenantControlPlaneOverload } from "./multi-tenant-control-plane-overload";
import {
  BACKLOG_DRAIN_KEY,
  HOT_TENANT_QUOTA_KEY,
  METADATA_WRITE_BATCHING_KEY,
  QUEUE_PARTITIONING_KEY,
  WORKER_CONCURRENCY_KEY,
  multiTenantControlPlaneOverloadSimulation,
} from "./multi-tenant-control-plane-overload/definition";
import { multiTenantControlPlaneOverloadCandidateUI } from "./multi-tenant-control-plane-overload/candidate-ui";
import { MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING } from "./multi-tenant-control-plane-overload/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(multiTenantControlPlaneOverloadSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += multiTenantControlPlaneOverloadSimulation.tickMs
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
      multiTenantControlPlaneOverloadSimulation,
      state,
      action,
      multiTenantControlPlaneOverloadSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const HOT_TENANT_CHURN_BEGINS_MS = 30_000;
const CONTROL_PLANE_SATURATION_MS = HOT_TENANT_CHURN_BEGINS_MS + 2 * 60_000;
const DRAIN_WINDOW_MS = HOT_TENANT_CHURN_BEGINS_MS + 5 * 60_000;

describe("Multi-Tenant Control Plane Overload", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(multiTenantControlPlaneOverload.isFree).toBe(false);
      expect(multiTenantControlPlaneOverload.library?.category).toBe("Distributed Systems");
      expect(multiTenantControlPlaneOverload.library?.tags.length).toBeGreaterThan(0);
      expect(multiTenantControlPlaneOverload.library?.skills.length).toBeGreaterThan(0);
      expect(multiTenantControlPlaneOverload.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(multiTenantControlPlaneOverloadCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(multiTenantControlPlaneOverloadCandidateUI.controls.length).toBeGreaterThanOrEqual(5);
      expect(multiTenantControlPlaneOverloadCandidateUI.components.length).toBe(6);
    });

    it("the briefing explicitly states all four business invariants", () => {
      expect(multiTenantControlPlaneOverload.description).toMatch(/data-plane traffic must remain available/i);
      expect(multiTenantControlPlaneOverload.description).toMatch(/metadata durability must never be lost/i);
      expect(multiTenantControlPlaneOverload.description).toMatch(/must not starve unrelated tenants/i);
      expect(multiTenantControlPlaneOverload.description).toMatch(/30% of shared control-plane capacity/i);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(multiTenantControlPlaneOverloadSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.dataPlaneSuccessRate).toBe(100);
      expect(state.values.hotTenantContainment).toBe("unmitigated");
    });

    it("hot tenant churn triggers the incident; the data plane stays healthy while the control plane goes critical (the misleading symptom)", () => {
      const state = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(HOT_TENANT_CHURN_BEGINS_MS);
      expect(state.status).toBe("critical");
      expect(state.values.dataPlaneSuccessRate).toBe(100);
      expect(state.values.hotTenantControlPlaneShare).toBeGreaterThan(30);
      expect(state.values.smallTenantConfigSuccessRate).toBeLessThan(95);
    });

    it("baseline (no action) stays in the misleading-symptom trap and never self-resolves", () => {
      const state = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000);
      expect(state.status).toBe("critical");
      expect(state.values.hotTenantContainment).toBe("unmitigated");
      expect(state.values.dataPlaneSuccessRate).toBe(100);
    });

    it("optimal path: quota-capping the hot tenant plus a dedicated lane plus moderate batching, once the drain window elapses, reaches the full fix", () => {
      const state = runScenario(DRAIN_WINDOW_MS + 5_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: METADATA_WRITE_BATCHING_KEY, value: "moderate" },
      ]);
      expect(state.values.hotTenantControlPlaneShare).toBeLessThanOrEqual(30);
      expect(state.values.smallTenantConfigSuccessRate).toBeGreaterThanOrEqual(95);
      expect(state.values.dataPlaneSuccessRate).toBe(100);
      expect(state.values.metadataWriteLossCount).toBe(0);
      expect(state.values.hotTenantContainment).toBe("quota-enforced");
    });

    it("alternate strong path: a stricter 10% cap plus a dedicated lane is equally structural and safe", () => {
      const state = runScenario(DRAIN_WINDOW_MS + 5_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-10-percent" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
      ]);
      expect(state.values.hotTenantControlPlaneShare).toBe(10);
      expect(state.values.smallTenantConfigSuccessRate).toBe(100);
      expect(state.values.dataPlaneSuccessRate).toBe(100);
      expect(state.values.hotTenantContainment).toBe("quota-enforced");
    });

    it("acceptable (not optimal) path: quota-only, with no dedicated lane, fixes the root cause but recovers fairness less fully", () => {
      const state = runScenario(DRAIN_WINDOW_MS + 5_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
      ]);
      expect(state.values.hotTenantControlPlaneShare).toBeLessThanOrEqual(30);
      expect(state.values.smallTenantConfigSuccessRate).toBeLessThan(95);
      expect(state.values.smallTenantConfigSuccessRate).toBeGreaterThanOrEqual(90);
    });

    it("acceptable (not optimal) path: lane-only protects fairness right now without fixing the 30% ceiling", () => {
      const state = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
      ]);
      expect(state.values.hotTenantControlPlaneShare).toBeGreaterThan(30);
      expect(state.values.smallTenantConfigSuccessRate).toBeGreaterThanOrEqual(95);
      expect(state.values.hotTenantContainment).toBe("lane-only");
    });

    it("harmful/pressure-transfer path: scaling up the worker fleet does not touch the control plane, and pushes metadata-DB write pressure higher than doing nothing, introducing real write loss", () => {
      const doNothing = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000);
      const scaledWorkers = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: "scaled-up" },
      ]);

      expect(scaledWorkers.values.metadataDbWritePressure).toBeGreaterThan(
        doNothing.values.metadataDbWritePressure as number,
      );
      expect(scaledWorkers.values.metadataWriteLossCount).toBeGreaterThan(0);
      expect(doNothing.values.metadataWriteLossCount).toBe(0);
      // The dashboard a candidate checks first (data-plane health) still
      // reads perfectly healthy -- exactly what makes this path tempting.
      expect(scaledWorkers.values.dataPlaneSuccessRate).toBe(100);
    });

    it("harmful path escalates: once the saturation wave hits, the worker-scaling trap's own data-plane success rate finally slips, proving a second, self-inflicted failure domain", () => {
      const state = runScenario(CONTROL_PLANE_SATURATION_MS + 10_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: "scaled-up" },
      ]);
      expect(state.values.dataPlaneSuccessRate).toBeLessThan(100);
      expect(state.values.metadataWriteLossCount).toBeGreaterThanOrEqual(10);
    });

    it("harmful/pressure-transfer path: batching too aggressively relieves metadata-DB pressure but blows up config convergence age", () => {
      const quotaOnly = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 5_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
      ]);
      const aggressiveBatching = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 5_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: METADATA_WRITE_BATCHING_KEY, value: "large" },
      ]);

      expect(aggressiveBatching.values.metadataDbWritePressure).toBeLessThan(
        quotaOnly.values.metadataDbWritePressure as number,
      );
      expect(aggressiveBatching.values.configConvergenceAgeSeconds).toBeGreaterThan(
        quotaOnly.values.configConvergenceAgeSeconds as number,
      );
      // Severe enough to drag fairness recovery below the acceptable bar.
      expect(aggressiveBatching.values.smallTenantConfigSuccessRate).toBeLessThan(90);
    });

    describe("Sequencing", () => {
      it("safe sequence: cap the hot tenant's quota BEFORE the drain window elapses -- the backlog genuinely shrinks over real elapsed time", () => {
        const justFixed = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 2_000, [
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        ]);
        const laterDrained = runScenario(DRAIN_WINDOW_MS + 5_000, [
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        ]);

        expect(justFixed.values.schedulerQueueDepth).toBeGreaterThan(
          laterDrained.values.schedulerQueueDepth as number,
        );
        expect(laterDrained.values.schedulerQueueDepth).toBeLessThan(100);
      });

      it("unsafe sequence: leaving the hot tenant unthrottled while 'draining' the backlog never actually shrinks it, no matter how much elapsed time passes", () => {
        const neverQuotaCapped = runScenario(DRAIN_WINDOW_MS + 5_000, [
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: BACKLOG_DRAIN_KEY, value: "draining" },
        ]);
        const quotaCappedThenDrained = runScenario(DRAIN_WINDOW_MS + 5_000, [
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        ]);

        // The backlog under the unsafe sequence (drain without ever
        // capping the hot tenant) stays far larger than under the safe
        // sequence (cap first), even after the exact same elapsed time.
        expect(neverQuotaCapped.values.schedulerQueueDepth).toBeGreaterThan(
          quotaCappedThenDrained.values.schedulerQueueDepth as number,
        );
        expect(neverQuotaCapped.values.hotTenantContainment).toBe("unmitigated");
      });
    });

    describe("Delayed consequence / recovery lag", () => {
      it("the fully correct fix does not instantly heal fairness -- it takes the drain window's real elapsed time", () => {
        const justFixed = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 33_000, [
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: METADATA_WRITE_BATCHING_KEY, value: "moderate" },
        ]);
        expect(justFixed.values.smallTenantConfigSuccessRate).toBeLessThan(95);
        const eligibilityJustFixed = evaluateCompletionEligibility(multiTenantControlPlaneOverloadSimulation, justFixed);
        expect(eligibilityJustFixed).toEqual({ eligible: true, tier: "acceptable" });

        const drained = runScenario(DRAIN_WINDOW_MS + 5_000, [
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
          { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: METADATA_WRITE_BATCHING_KEY, value: "moderate" },
        ]);
        expect(drained.values.smallTenantConfigSuccessRate).toBeGreaterThanOrEqual(95);
      });
    });

    it("tracks peak scheduler queue depth and metadata write loss generically via numericWatchFields", () => {
      const state = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 1_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 500, controlKey: WORKER_CONCURRENCY_KEY, value: "scaled-up" },
      ]);
      expect(state.peaks.peakValues.schedulerQueueDepth).toBeGreaterThan(0);
    });

    it("stays active (never auto-fails) even after the worker-scaling trap's real metadata write loss combined with an unthrottled hot tenant persists past the old sustained window", () => {
      const state = runScenario(CONTROL_PLANE_SATURATION_MS + 61_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: "scaled-up" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        multiTenantControlPlaneOverloadSimulation.failureCondition.sustainedSeconds,
      );
    });

    describe("Immediate-Finish audit", () => {
      it("a zero-action Finish issued before the hot tenant's churn even begins is moot: no incident has started yet", () => {
        const state = runScenario(HOT_TENANT_CHURN_BEGINS_MS - 5_000);
        expect(state.incidentStartedAtMs).toBeNull();
        const result = evaluateCandidateDeclaredFinish(multiTenantControlPlaneOverloadSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("a zero-action Finish issued the instant churn fires does NOT resolve -- the misleading symptom is already unsafe underneath", () => {
        const state = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 1_000);
        const result = evaluateCandidateDeclaredFinish(multiTenantControlPlaneOverloadSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
        expect(result.completionTier).toBeNull();
      });
    });
  });

  describe("Completion mode: candidate_declared, two-tier (optimal + acceptable)", () => {
    it("the full fix does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(DRAIN_WINDOW_MS + 35_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: METADATA_WRITE_BATCHING_KEY, value: "moderate" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        multiTenantControlPlaneOverloadSimulation.successCondition.sustainedSeconds,
      );
    });

    it("Finish from the full fix -> resolved/optimal", () => {
      const state = runScenario(DRAIN_WINDOW_MS + 35_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: METADATA_WRITE_BATCHING_KEY, value: "moderate" },
      ]);
      const result = evaluateCandidateDeclaredFinish(multiTenantControlPlaneOverloadSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from the lane-only mitigation -> resolved/acceptable (fairness protected, ceiling not enforced)", () => {
      const state = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
      ]);
      const result = evaluateCandidateDeclaredFinish(multiTenantControlPlaneOverloadSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000);
      const result = evaluateCandidateDeclaredFinish(multiTenantControlPlaneOverloadSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the worker-scaling trap (real metadata write loss) -> declared_unstable, never acceptable, regardless of data-plane health", () => {
      const state = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: "scaled-up" },
      ]);
      expect(state.values.dataPlaneSuccessRate).toBe(100);
      const result = evaluateCandidateDeclaredFinish(multiTenantControlPlaneOverloadSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("never auto-fails regardless of candidate_declared mode, but Finish from this trap still declares unstable", () => {
      const state = runScenario(CONTROL_PLANE_SATURATION_MS + 61_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: "scaled-up" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(multiTenantControlPlaneOverloadSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
      ];
      const runA = runScenario(DRAIN_WINDOW_MS + 5_000, actions);
      const runB = runScenario(DRAIN_WINDOW_MS + 5_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal, acceptable (quota-only and lane-only), baseline, and harmful (worker-scaling) paths with coherent Data Integrity discrimination", () => {
      const optimalState = runScenario(DRAIN_WINDOW_MS + 35_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: METADATA_WRITE_BATCHING_KEY, value: "moderate" },
      ]);
      const optimalFinish = evaluateCandidateDeclaredFinish(multiTenantControlPlaneOverloadSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
        extractFinishScoringInputs(multiTenantControlPlaneOverloadSimulation, optimalFinish),
      );

      const laneOnlyState = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
      ]);
      const laneOnlyFinish = evaluateCandidateDeclaredFinish(multiTenantControlPlaneOverloadSimulation, laneOnlyState);
      const laneOnlyScore = scoreAuthoredAttempt(
        MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
        extractFinishScoringInputs(multiTenantControlPlaneOverloadSimulation, laneOnlyFinish),
      );

      const baselineState = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
        extractScoringInputs(multiTenantControlPlaneOverloadSimulation, baselineState),
      );

      const workerScalingState = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 40_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: "scaled-up" },
      ]);
      const workerScalingScore = scoreAuthoredAttempt(
        MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
        extractScoringInputs(multiTenantControlPlaneOverloadSimulation, workerScalingState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(optimalScore.total).toBeGreaterThan(laneOnlyScore.total);
      expect(laneOnlyScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(workerScalingScore.total);

      // The central assertion: Data Integrity discriminates the
      // structural fix from every other path, including the
      // available-looking-but-unmitigated baseline and the harmful
      // worker-scaling trap, which never reaches top Data Integrity
      // despite dataPlaneSuccessRate reading 100 in both cases.
      expect(optimalScore.breakdown.dataIntegrity).toBe(200);
      expect(laneOnlyScore.breakdown.dataIntegrity).toBe(50);
      expect(baselineScore.breakdown.dataIntegrity).toBe(50);
      expect(workerScalingScore.breakdown.dataIntegrity).toBe(50);

      // Sanity checks against the four suspicious-score failure modes:
      // harmful never scores anywhere near optimal, no-action/baseline
      // never scores highly, and acceptable never exceeds optimal.
      expect(workerScalingScore.total).toBeLessThan(optimalScore.total / 2);
      expect(baselineScore.total).toBeLessThan(optimalScore.total * 0.6);
      expect(laneOnlyScore.total).toBeLessThanOrEqual(optimalScore.total);
    });

    it("harmful (aggressive batching) scores below the acceptable quota-only path despite also capping the hot tenant's share", () => {
      const quotaOnlyState = runScenario(DRAIN_WINDOW_MS + 5_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
      ]);
      const quotaOnlyScore = scoreAuthoredAttempt(
        MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
        extractScoringInputs(multiTenantControlPlaneOverloadSimulation, quotaOnlyState),
      );

      const aggressiveBatchingState = runScenario(HOT_TENANT_CHURN_BEGINS_MS + 5_000, [
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
        { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: METADATA_WRITE_BATCHING_KEY, value: "large" },
      ]);
      const aggressiveBatchingScore = scoreAuthoredAttempt(
        MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
        extractScoringInputs(multiTenantControlPlaneOverloadSimulation, aggressiveBatchingState),
      );

      expect(aggressiveBatchingScore.total).toBeLessThan(quotaOnlyScore.total);
    });
  });
});
