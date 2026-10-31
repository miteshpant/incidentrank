import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { connectionPoolStarvation } from "./connection-pool-starvation";
import {
  connectionPoolStarvationSimulation,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_TRAFFIC_GRAPHS_KEY,
  INSPECT_POOL_CONFIG_KEY,
  RESTART_API_PODS_KEY,
  SCALE_API_REPLICAS_KEY,
  DB_POOL_MAX_SIZE_KEY,
} from "./connection-pool-starvation/definition";
import { CONNECTION_POOL_STARVATION_SCORING } from "./connection-pool-starvation/scoring";
import { connectionPoolStarvationCandidateUI } from "./connection-pool-starvation/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = connectionPoolStarvationSimulation;
const POOL_STARVES_MS = 45_000;

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

describe("Connection Pool Starvation", () => {
  it("carries real library metadata, is linear-structured, intermediate-level, and paid", () => {
    expect(connectionPoolStarvation.structure).toBe("linear");
    expect(connectionPoolStarvation.difficulty).toBe("intermediate");
    expect(connectionPoolStarvation.isFree).toBe(false);
    expect(connectionPoolStarvation.library?.category).toBe("Databases & Storage");
    expect(connectionPoolStarvation.library?.primarySkill).toBeTruthy();
    expect(connectionPoolStarvation.library?.skills.length).toBeGreaterThan(0);
  });

  it("has version 1", () => {
    expect(connectionPoolStarvation.version).toBe(1);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = connectionPoolStarvationCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("has at least one root_cause and one downstream_symptom tagged metric", () => {
    const metrics = connectionPoolStarvationCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "root_cause")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "downstream_symptom")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "noise")).toBe(true);
  });

  it("starts healthy with normal traffic and a normal pool", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.trafficRequestsPerSecond).toBe(420);
    expect(state.values.poolUtilizationPercent).toBe(22);
    expect(state.values.requestLatencyMs).toBe(90);
  });

  it("the pool starves while traffic stays completely flat — the config-regression signal", () => {
    const healthy = createInitialState(SIM);
    const starving = runScenario(POOL_STARVES_MS + 1_000);
    expect(starving.componentHealth["connection-pool"]).toBe("critical");
    expect(starving.componentHealth["primary-db"]).toBe("healthy");
    // Traffic barely moves at all — this is NOT a demand-driven surge.
    expect(
      Math.abs((starving.values.trafficRequestsPerSecond as number) - (healthy.values.trafficRequestsPerSecond as number)),
    ).toBeLessThan(10);
  });

  it("the primary database's own CPU looks normal even while the pool is critical — the misleading signal", () => {
    const state = runScenario(POOL_STARVES_MS + 1_000);
    expect(state.values.dbCpuPercent).toBeLessThan(30);
    expect(state.values.poolUtilizationPercent).toBeGreaterThanOrEqual(90);
  });

  it("a noise signal (deploy audit log scroll count) climbs during the incident but is unrelated to root cause", () => {
    const healthy = createInitialState(SIM);
    const starving = runScenario(POOL_STARVES_MS + 1_000);
    expect(starving.values.deployAuditLogScrollCount as number).toBeGreaterThan(
      healthy.values.deployAuditLogScrollCount as number,
    );
    // Scroll count stays roughly unchanged by the correct fix — proving it
    // never factored into successCondition/failureCondition/rules.
    const fixed = runScenario(POOL_STARVES_MS + 20_000, [
      { atMs: POOL_STARVES_MS + 1_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
    ]);
    expect(fixed.values.deployAuditLogScrollCount).toBe(9);
  });

  describe("inferior remediation paths", () => {
    it("restarting API pods alone is plausible but insufficient — the pool relapses", () => {
      const state = runScenario(POOL_STARVES_MS + 5_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: RESTART_API_PODS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("restarted-pods-only");
      expect(state.values.poolUtilizationPercent).toBeGreaterThanOrEqual(90);
    });

    it("scaling out API replicas alone does not relieve the pool — the ceiling, not the fleet size, is the cause", () => {
      const state = runScenario(POOL_STARVES_MS + 5_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: SCALE_API_REPLICAS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("scaled-replicas-only");
      expect(state.values.poolUtilizationPercent).toBeGreaterThanOrEqual(95);
      expect(state.componentHealth["connection-pool"]).toBe("critical");
    });
  });

  describe("the correct fix — order independence", () => {
    it("investigating deploy history, then pool config, then fixing — reaches the correlated path", () => {
      const state = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: POOL_STARVES_MS + 2_000, controlKey: INSPECT_POOL_CONFIG_KEY, value: true },
        { atMs: POOL_STARVES_MS + 3_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["connection-pool"]).toBe("healthy");
      expect(state.componentHealth["api-service"]).toBe("healthy");
    });

    it("investigating pool config first, then deploy history, then fixing — a different order reaches the same correlated path", () => {
      const state = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: INSPECT_POOL_CONFIG_KEY, value: true },
        { atMs: POOL_STARVES_MS + 2_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: POOL_STARVES_MS + 3_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });

    it("investigating traffic graphs too (confirming traffic is flat) still reaches the correlated path with the real fix", () => {
      const state = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: INSPECT_TRAFFIC_GRAPHS_KEY, value: true },
        { atMs: POOL_STARVES_MS + 2_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: POOL_STARVES_MS + 3_000, controlKey: INSPECT_POOL_CONFIG_KEY, value: true },
        { atMs: POOL_STARVES_MS + 4_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["connection-pool"]).toBe("healthy");
    });

    it("raising the pool size without investigating anything first still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["connection-pool"]).toBe("healthy");
    });

    it("a partial pool increase (50) relieves some pressure but is not enough", () => {
      const state = runScenario(POOL_STARVES_MS + 5_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 50 },
      ]);
      expect(state.values.diagnosisPath).toBe("partial-pool-increase");
      expect(state.values.poolUtilizationPercent).toBeLessThan(95);
      expect(state.values.poolUtilizationPercent).toBeGreaterThan(50);
    });
  });

  it("verification: successCondition requires low error rate, low latency, and pool utilization under 50%", () => {
    const state = runScenario(POOL_STARVES_MS + 20_000, [
      { atMs: POOL_STARVES_MS + 1_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after pool utilization remains critical past the old sustained window", () => {
    const state = runScenario(POOL_STARVES_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: POOL_STARVES_MS + 1_000, controlKey: INSPECT_POOL_CONFIG_KEY, value: true },
      { atMs: POOL_STARVES_MS + 2_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
    ];
    const runA = runScenario(POOL_STARVES_MS + 10_000, actions);
    const runB = runScenario(POOL_STARVES_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(CONNECTION_POOL_STARVATION_SCORING, inputs);
    }

    it("a candidate who correlates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: POOL_STARVES_MS + 2_000, controlKey: INSPECT_POOL_CONFIG_KEY, value: true },
        { atMs: POOL_STARVES_MS + 3_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);
      const guessed = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);

      const correlatedScore = scoreOf(correlated).total;
      const guessedScore = scoreOf(guessed).total;

      expect(correlatedScore).toBeGreaterThan(guessedScore);
    });

    it("a candidate who chases an inferior traffic-driven remediation scores lower than one who takes the correlated correct path", () => {
      const correlated = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: POOL_STARVES_MS + 2_000, controlKey: INSPECT_POOL_CONFIG_KEY, value: true },
        { atMs: POOL_STARVES_MS + 3_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);
      const randomExploration = runScenario(5 * 60_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: RESTART_API_PODS_KEY, value: true },
        { atMs: POOL_STARVES_MS + 30_000, controlKey: SCALE_API_REPLICAS_KEY, value: true },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(randomExploration).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated-then-fixed diagnosisPath", () => {
      const correlated = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: POOL_STARVES_MS + 2_000, controlKey: INSPECT_POOL_CONFIG_KEY, value: true },
        { atMs: POOL_STARVES_MS + 3_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);
      const guessed = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 1_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);

      expect(scoreOf(correlated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(80);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const correlated = runScenario(POOL_STARVES_MS + 20_000, [
        { atMs: POOL_STARVES_MS + 3_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
      ]);
      const result = scoreOf(correlated);

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
    it("surfaces pool utilization as the root cause and latency/error-rate as observed effects", () => {
      const state = runScenario(POOL_STARVES_MS + 1_000);
      const narrative = buildIncidentNarrative(connectionPoolStarvationCandidateUI, state.values);

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Connection Pool Utilization");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Request Latency", "Request Error Rate", "Pool Wait Queue Depth"]),
      );
      expect(narrative.context.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Traffic (req/s)", "Primary DB CPU"]),
      );
    });

    it("never surfaces the noise-tagged deploy audit log scroll count in any narrative group", () => {
      const state = runScenario(POOL_STARVES_MS + 1_000);
      const narrative = buildIncidentNarrative(connectionPoolStarvationCandidateUI, state.values);
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Deploy Audit Log Scroll Count")).toBe(false);
    });
  });
});
