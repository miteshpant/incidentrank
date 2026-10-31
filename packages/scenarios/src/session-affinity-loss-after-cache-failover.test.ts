import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { sessionAffinityLossAfterCacheFailover } from "./session-affinity-loss-after-cache-failover";
import {
  sessionAffinityLossAfterCacheFailoverSimulation,
  INSPECT_SESSION_ROUTING_KEY,
  INSPECT_AUTH_ERROR_LOGS_KEY,
  INSPECT_CACHE_NODE_METRICS_KEY,
  SCALE_CACHE_CLUSTER_KEY,
  RESTART_APP_SERVERS_KEY,
  RESEED_HASH_RING_KEY,
  FORCE_SESSION_RESYNC_KEY,
} from "./session-affinity-loss-after-cache-failover/definition";
import { SESSION_AFFINITY_LOSS_AFTER_CACHE_FAILOVER_SCORING } from "./session-affinity-loss-after-cache-failover/scoring";
import { sessionAffinityLossAfterCacheFailoverCandidateUI } from "./session-affinity-loss-after-cache-failover/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = sessionAffinityLossAfterCacheFailoverSimulation;
const FAILOVER_BEGINS_MS = 30_000;

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

describe("Session Affinity Loss After Cache Node Failover", () => {
  it("carries real library metadata, is linear-structured, staff-level, and paid", () => {
    expect(sessionAffinityLossAfterCacheFailover.structure).toBe("linear");
    expect(sessionAffinityLossAfterCacheFailover.difficulty).toBe("staff");
    expect(sessionAffinityLossAfterCacheFailover.isFree).toBe(false);
    expect(sessionAffinityLossAfterCacheFailover.library?.category).toBe("Caching");
    expect(sessionAffinityLossAfterCacheFailover.library?.primarySkill).toBeTruthy();
    expect(sessionAffinityLossAfterCacheFailover.library?.skills.length).toBeGreaterThan(0);
  });

  it("has version 1", () => {
    expect(sessionAffinityLossAfterCacheFailover.version).toBe(1);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = sessionAffinityLossAfterCacheFailoverCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("tags at least one root_cause and at least one downstream_symptom metric", () => {
    const metrics = sessionAffinityLossAfterCacheFailoverCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "root_cause")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "downstream_symptom")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "noise")).toBe(true);
  });

  it("starts healthy with every session-correctness signal near zero", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.sessionAffinityMismatchRatePercent).toBe(1);
    expect(state.values.sessionStateInconsistencyRatePercent).toBe(0.5);
    expect(state.values.unexpectedLogoutRatePercent).toBe(0.3);
  });

  it("request latency/error rate barely move once the failover begins — the misleading 'service is fine' signal", () => {
    const state = runScenario(FAILOVER_BEGINS_MS + 1_000);
    expect(state.values.requestLatencyMs as number).toBeLessThan(100);
    expect(state.values.requestErrorRatePercent as number).toBeLessThan(1);
  });

  it("session affinity mismatch, inconsistency, and unexpected logouts all spike once the failover begins — the real signal", () => {
    const state = runScenario(FAILOVER_BEGINS_MS + 1_000);
    expect(state.values.sessionAffinityMismatchRatePercent as number).toBeGreaterThan(20);
    expect(state.values.sessionStateInconsistencyRatePercent as number).toBeGreaterThan(15);
    expect(state.values.unexpectedLogoutRatePercent as number).toBeGreaterThan(10);
    expect(state.componentHealth["session-cache"]).toBe("critical");
    expect(state.componentHealth["load-balancer"]).toBe("healthy");
  });

  it("a noise signal (cache node CPU/memory) climbs mildly during the incident but is causally unrelated to the fix", () => {
    const healthy = createInitialState(SIM);
    const broken = runScenario(FAILOVER_BEGINS_MS + 1_000);
    expect(broken.values.cacheNodeCpuPercent as number).toBeGreaterThan(
      healthy.values.cacheNodeCpuPercent as number,
    );
    // CPU stays roughly unchanged by the correct fix — proving it never
    // factored into successCondition/failureCondition/rules.
    const fixed = runScenario(FAILOVER_BEGINS_MS + 20_000, [
      { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: RESEED_HASH_RING_KEY, value: true },
      { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
    ]);
    expect(fixed.values.cacheNodeCpuPercent).toBe(24);
  });

  describe("inferior investigation paths", () => {
    it("scaling the cache cluster alone is plausible but mistaken — it does not fix affinity and makes mismatch slightly worse", () => {
      const state = runScenario(FAILOVER_BEGINS_MS + 5_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: SCALE_CACHE_CLUSTER_KEY, value: 9 },
      ]);
      expect(state.values.diagnosisPath).toBe("scaled-cache-cluster-only");
      expect(state.values.sessionAffinityMismatchRatePercent as number).toBeGreaterThanOrEqual(20);
      expect(state.componentHealth["session-cache"]).not.toBe("healthy");
    });

    it("restarting the app server pool alone is plausible but insufficient — the mismatch relapses", () => {
      const state = runScenario(FAILOVER_BEGINS_MS + 5_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: RESTART_APP_SERVERS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("restarted-app-servers-only");
      expect(state.values.sessionAffinityMismatchRatePercent as number).toBeGreaterThan(10);
    });

    it("reseeding the hash ring without forcing a resync is a meaningful partial fix, not a full recovery", () => {
      const state = runScenario(FAILOVER_BEGINS_MS + 5_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: RESEED_HASH_RING_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("reseeded-without-resync");
      expect(state.values.sessionStateInconsistencyRatePercent as number).toBeLessThan(15);
      expect(state.values.sessionStateInconsistencyRatePercent as number).toBeGreaterThan(2);
    });
  });

  describe("the correct, correlated fix — order independence", () => {
    it("investigating routing, then auth logs, then cache metrics, then applying both fix halves — reaches the correlated path", () => {
      const state = runScenario(FAILOVER_BEGINS_MS + 20_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: INSPECT_SESSION_ROUTING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 2_000, controlKey: INSPECT_AUTH_ERROR_LOGS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 3_000, controlKey: INSPECT_CACHE_NODE_METRICS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 4_000, controlKey: RESEED_HASH_RING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 5_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["session-cache"]).toBe("healthy");
      expect(state.componentHealth["app-server-pool"]).toBe("healthy");
      expect(state.componentHealth["auth-service"]).toBe("healthy");
    });

    it("investigating cache metrics first, then routing, then auth logs, then fixing — a different order reaches the same correlated path", () => {
      const state = runScenario(FAILOVER_BEGINS_MS + 20_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: INSPECT_CACHE_NODE_METRICS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 2_000, controlKey: INSPECT_SESSION_ROUTING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 3_000, controlKey: INSPECT_AUTH_ERROR_LOGS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 4_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 5_000, controlKey: RESEED_HASH_RING_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });

    it("applying both fix halves without investigating first still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(FAILOVER_BEGINS_MS + 20_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: RESEED_HASH_RING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["session-cache"]).toBe("healthy");
    });
  });

  it("verification: successCondition requires affinity mismatch, state inconsistency, and unexpected logouts all recovered together", () => {
    const state = runScenario(FAILOVER_BEGINS_MS + 20_000, [
      { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: RESEED_HASH_RING_KEY, value: true },
      { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("the reseeded-without-resync partial fix does NOT satisfy successCondition", () => {
    const state = runScenario(FAILOVER_BEGINS_MS + 20_000, [
      { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: RESEED_HASH_RING_KEY, value: true },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).not.toBe("resolved");
  });

  it("stays active (never auto-fails) even after session state inconsistency remains critical past the old sustained window", () => {
    const state = runScenario(FAILOVER_BEGINS_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: INSPECT_CACHE_NODE_METRICS_KEY, value: true },
      { atMs: FAILOVER_BEGINS_MS + 2_000, controlKey: RESEED_HASH_RING_KEY, value: true },
      { atMs: FAILOVER_BEGINS_MS + 3_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
    ];
    const runA = runScenario(FAILOVER_BEGINS_MS + 10_000, actions);
    const runB = runScenario(FAILOVER_BEGINS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(SESSION_AFFINITY_LOSS_AFTER_CACHE_FAILOVER_SCORING, inputs);
    }

    it("a candidate who correlates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(FAILOVER_BEGINS_MS + 20_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: INSPECT_SESSION_ROUTING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 2_000, controlKey: INSPECT_AUTH_ERROR_LOGS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 3_000, controlKey: INSPECT_CACHE_NODE_METRICS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 4_000, controlKey: RESEED_HASH_RING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 5_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
      ]);
      const guessed = runScenario(FAILOVER_BEGINS_MS + 20_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: RESEED_HASH_RING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
      ]);

      const correlatedScore = scoreOf(correlated).total;
      const guessedScore = scoreOf(guessed).total;

      expect(correlatedScore).toBeGreaterThan(guessedScore);
    });

    it("a candidate who chases an inferior remediation scores lower than one who takes the correlated strong path", () => {
      const correlated = runScenario(FAILOVER_BEGINS_MS + 20_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: INSPECT_SESSION_ROUTING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 2_000, controlKey: INSPECT_AUTH_ERROR_LOGS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 3_000, controlKey: INSPECT_CACHE_NODE_METRICS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 4_000, controlKey: RESEED_HASH_RING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 5_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
      ]);
      const randomExploration = runScenario(5 * 60_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: SCALE_CACHE_CLUSTER_KEY, value: 9 },
        { atMs: FAILOVER_BEGINS_MS + 30_000, controlKey: RESTART_APP_SERVERS_KEY, value: true },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(randomExploration).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated-then-fixed diagnosisPath", () => {
      const correlated = runScenario(FAILOVER_BEGINS_MS + 20_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: INSPECT_SESSION_ROUTING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 2_000, controlKey: INSPECT_AUTH_ERROR_LOGS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 3_000, controlKey: INSPECT_CACHE_NODE_METRICS_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 4_000, controlKey: RESEED_HASH_RING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 5_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
      ]);
      const guessed = runScenario(FAILOVER_BEGINS_MS + 20_000, [
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: RESEED_HASH_RING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
      ]);

      expect(scoreOf(correlated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(80);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const correlated = runScenario(FAILOVER_BEGINS_MS + 20_000, [
        { atMs: FAILOVER_BEGINS_MS + 4_000, controlKey: RESEED_HASH_RING_KEY, value: true },
        { atMs: FAILOVER_BEGINS_MS + 4_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
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
      expect(
        Object.values(result.maxPoints as Record<string, number>).reduce((a, b) => a + b, 0),
      ).toBe(1000);
    });
  });

  describe("post-incident narrative using roleInIncident", () => {
    it("surfaces session affinity mismatch as the root cause and session inconsistency/unexpected logouts as observed effects", () => {
      const state = runScenario(FAILOVER_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        sessionAffinityLossAfterCacheFailoverCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Session Affinity Mismatch Rate");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Session State Inconsistency Rate", "Unexpected Logout Rate"]),
      );
      expect(narrative.context.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Request Latency", "Request Error Rate"]),
      );
    });

    it("never surfaces the noise-tagged cache node CPU/memory metrics in any narrative group", () => {
      const state = runScenario(FAILOVER_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        sessionAffinityLossAfterCacheFailoverCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Cache Node CPU")).toBe(false);
      expect(all.some((e) => e.label === "Cache Node Memory")).toBe(false);
    });
  });
});
