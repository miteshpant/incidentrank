import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { orphanedBackgroundWorkerQueueGrowth } from "./orphaned-background-worker-queue-growth";
import {
  orphanedBackgroundWorkerQueueGrowthSimulation,
  INSPECT_WORKER_LOGS_KEY,
  INSPECT_DEPLOY_DIFF_KEY,
  INSPECT_QUEUE_DEPTH_KEY,
  ROLLBACK_WORKER_DEPLOY_KEY,
  RESTART_WORKER_PODS_KEY,
  WORKER_CONCURRENCY_KEY,
  PAUSE_PRODUCERS_KEY,
} from "./orphaned-background-worker-queue-growth/definition";
import { ORPHANED_BACKGROUND_WORKER_QUEUE_GROWTH_SCORING } from "./orphaned-background-worker-queue-growth/scoring";
import { orphanedBackgroundWorkerQueueGrowthCandidateUI } from "./orphaned-background-worker-queue-growth/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = orphanedBackgroundWorkerQueueGrowthSimulation;
const DEPLOY_BREAKS_WORKERS_MS = 30_000;

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(SIM);
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += SIM.tickMs) {
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

    const result = simulate(SIM, state, action, SIM.tickMs);
    state = result.state;
  }

  return state;
}

describe("Orphaned Background Worker Queue Growth", () => {
  it("carries real library metadata, is parallel-structured, staff-level, and paid", () => {
    expect(orphanedBackgroundWorkerQueueGrowth.structure).toBe("parallel");
    expect(orphanedBackgroundWorkerQueueGrowth.difficulty).toBe("staff");
    expect(orphanedBackgroundWorkerQueueGrowth.isFree).toBe(false);
    expect(orphanedBackgroundWorkerQueueGrowth.library?.category).toBe("Messaging & Streaming");
    expect(orphanedBackgroundWorkerQueueGrowth.library?.primarySkill).toBeTruthy();
    expect(orphanedBackgroundWorkerQueueGrowth.library?.skills.length).toBeGreaterThan(0);
  });

  it("has version 1", () => {
    expect(orphanedBackgroundWorkerQueueGrowth.version).toBe(1);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = orphanedBackgroundWorkerQueueGrowthCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("includes at least one root_cause and at least one downstream_symptom metric", () => {
    const metrics = orphanedBackgroundWorkerQueueGrowthCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "root_cause")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "downstream_symptom")).toBe(true);
  });

  it("starts healthy with a full consumer fleet attached and a small queue", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.activeConsumerCount).toBe(12);
    expect(state.values.queueDepth).toBe(500);
    expect(state.values.producerPublishRatePerSecond).toBe(40);
  });

  it("consumers go fully dead after the deploy — zero active consumers, not slow, not thrashing", () => {
    const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 1_000);
    expect(state.values.activeConsumerCount).toBe(0);
    expect(state.componentHealth["worker-pool"]).toBe("critical");
  });

  it("producer keeps publishing normally while workers are dead — the misleading-healthy signal", () => {
    const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 1_000);
    expect(state.componentHealth["producer-service"]).toBe("healthy");
    expect(state.values.producerPublishRatePerSecond).toBe(40);
    expect(state.values.producerErrorRate).toBeLessThan(1);
  });

  it("queue depth grows unbounded while zero consumers are attached", () => {
    const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 1_000);
    expect(state.values.queueDepth as number).toBeGreaterThan(5_000);
  });

  it("a noise signal (monitoring dashboard refresh lag) climbs during the incident but is unrelated to the fix", () => {
    const healthy = createInitialState(SIM);
    const dead = runScenario(DEPLOY_BREAKS_WORKERS_MS + 1_000);
    expect(dead.values.monitoringDashboardRefreshLagSeconds as number).toBeGreaterThan(
      healthy.values.monitoringDashboardRefreshLagSeconds as number,
    );
    // Refresh lag stays unchanged by the correct fix — proving it never
    // factored into successCondition/failureCondition/rules.
    const fixed = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
      { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
      { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
    ]);
    expect(fixed.values.monitoringDashboardRefreshLagSeconds).toBe(9);
  });

  describe("inferior / incomplete remediation paths", () => {
    it("restarting worker pods alone is plausible but insufficient — the env var is still broken, workers crash-loop again", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 5_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: RESTART_WORKER_PODS_KEY, value: true },
      ]);
      expect(state.values.activeConsumerCount).toBe(0);
      expect(state.values.diagnosisPath).toBe("restarted-workers-only");
      expect(state.componentHealth["worker-pool"]).toBe("critical");
    });

    it("pausing producers alone stops queue growth but drains nothing and never fixes the dead consumers", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 5_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: PAUSE_PRODUCERS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("paused-producers-only");
      expect(state.values.activeConsumerCount).toBe(0);
      expect(state.values.queueDepth as number).toBeGreaterThan(5_000);
    });

    it("rolling back the deploy without raising concurrency (Track A only) leaves the backlog draining slowly", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 5_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("fixed-deploy-default-concurrency");
      expect(state.values.activeConsumerCount).toBe(12);
      expect(state.values.queueDepth as number).toBeGreaterThan(2_000);
      expect(state.componentHealth["job-queue"]).toBe("degraded");
    });

    it("raising concurrency without rolling back the deploy (Track B only) does nothing — there are zero consumers to scale", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 5_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
      ]);
      expect(state.values.diagnosisPath).toBe("raised-concurrency-only");
      expect(state.values.activeConsumerCount).toBe(0);
      expect(state.componentHealth["worker-pool"]).toBe("critical");
    });
  });

  describe("the correct fix — both independent tracks completed", () => {
    it("investigating all three sources, then rolling back the deploy, then raising concurrency — reaches the best diagnosisPath", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: INSPECT_WORKER_LOGS_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: INSPECT_DEPLOY_DIFF_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 3_000, controlKey: INSPECT_QUEUE_DEPTH_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 4_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 5_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-both-tracks-fixed");
      expect(state.componentHealth["worker-pool"]).toBe("healthy");
      expect(state.componentHealth["job-queue"]).toBe("healthy");
      expect(state.values.activeConsumerCount).toBe(12);
    });

    it("raising concurrency first, then investigating, then rolling back — a different order still reaches the same best path (order independence)", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: INSPECT_QUEUE_DEPTH_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 3_000, controlKey: INSPECT_DEPLOY_DIFF_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 4_000, controlKey: INSPECT_WORKER_LOGS_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 5_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-both-tracks-fixed");
    });

    it("completing both tracks without investigating first still resolves the outage, but as a diagnosed-less fix", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
      ]);
      expect(state.values.diagnosisPath).toBe("both-tracks-fixed-no-investigation");
      expect(state.componentHealth["worker-pool"]).toBe("healthy");
      expect(state.componentHealth["job-queue"]).toBe("healthy");
    });

    it("a partial concurrency raise (8) after rollback drains faster than default but is not fully cleared", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 5_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: WORKER_CONCURRENCY_KEY, value: 8 },
      ]);
      expect(state.values.diagnosisPath).toBe("fixed-deploy-partial-concurrency");
      expect(state.values.queueDepth as number).toBeLessThan(4_800);
      expect(state.values.queueDepth as number).toBeGreaterThan(600);
    });
  });

  it("verification: successCondition requires consumers back at full strength, queue drained, and delivery delay recovered together", () => {
    const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
      { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
      { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after queue depth remains past the failure threshold's old sustained window", () => {
    const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: INSPECT_DEPLOY_DIFF_KEY, value: true },
      { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
      { atMs: DEPLOY_BREAKS_WORKERS_MS + 3_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
    ];
    const runA = runScenario(DEPLOY_BREAKS_WORKERS_MS + 10_000, actions);
    const runB = runScenario(DEPLOY_BREAKS_WORKERS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(ORPHANED_BACKGROUND_WORKER_QUEUE_GROWTH_SCORING, inputs);
    }

    it("a candidate who investigates before completing both tracks scores strictly higher than one who completes both tracks blind", () => {
      const investigated = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: INSPECT_WORKER_LOGS_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: INSPECT_DEPLOY_DIFF_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 3_000, controlKey: INSPECT_QUEUE_DEPTH_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 4_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 5_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);
      const blind = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);

      expect(scoreOf(investigated).total).toBeGreaterThan(scoreOf(blind).total);
    });

    it("a candidate who completes both tracks scores strictly higher than one who only chases a plausible-but-inferior remediation", () => {
      const bothTracks = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: INSPECT_WORKER_LOGS_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: INSPECT_DEPLOY_DIFF_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 3_000, controlKey: INSPECT_QUEUE_DEPTH_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 4_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 5_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);
      const inferiorOnly = runScenario(5 * 60_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: RESTART_WORKER_PODS_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 30_000, controlKey: PAUSE_PRODUCERS_KEY, value: true },
      ]);

      expect(scoreOf(bothTracks).total).toBeGreaterThan(scoreOf(inferiorOnly).total);
    });

    it("the dataIntegrity dimension awards full points only for the investigated-both-tracks-fixed diagnosisPath", () => {
      const investigated = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: INSPECT_WORKER_LOGS_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: INSPECT_DEPLOY_DIFF_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 3_000, controlKey: INSPECT_QUEUE_DEPTH_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 4_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 5_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);
      const blind = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);

      expect(scoreOf(investigated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(blind).breakdown.dataIntegrity).toBe(70);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const investigated = runScenario(DEPLOY_BREAKS_WORKERS_MS + 20_000, [
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 4_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
        { atMs: DEPLOY_BREAKS_WORKERS_MS + 5_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);
      const result = scoreOf(investigated);

      expect(result.maxPoints).toEqual({
        recovery: 300,
        customerImpact: 200,
        dataIntegrity: 200,
        reliability: 150,
        costEfficiency: 100,
        operationalEfficiency: 50,
      });
    });
  });

  describe("post-incident narrative using roleInIncident", () => {
    it("surfaces active consumer count as the root cause and queue depth / notification delay as observed effects", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        orphanedBackgroundWorkerQueueGrowthCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Active Consumer Count");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Job Queue Depth", "Notification Delivery Delay"]),
      );
      expect(narrative.context.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Producer Publish Rate", "Producer Error Rate"]),
      );
    });

    it("never surfaces the noise-tagged monitoring dashboard refresh lag in any narrative group", () => {
      const state = runScenario(DEPLOY_BREAKS_WORKERS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        orphanedBackgroundWorkerQueueGrowthCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Monitoring Dashboard Refresh Lag")).toBe(false);
    });
  });
});
