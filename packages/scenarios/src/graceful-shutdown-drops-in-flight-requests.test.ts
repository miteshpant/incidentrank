import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { gracefulShutdownDropsInFlightRequests } from "./graceful-shutdown-drops-in-flight-requests";
import {
  gracefulShutdownDropsInFlightRequestsSimulation,
  INSPECT_SHUTDOWN_HOOK_LOGS_KEY,
  INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  DRAIN_TIMEOUT_SECONDS_KEY,
  DEPLOY_STRATEGY_KEY,
  REPLICA_COUNT_KEY,
} from "./graceful-shutdown-drops-in-flight-requests/definition";
import { GRACEFUL_SHUTDOWN_DROPS_IN_FLIGHT_REQUESTS_SCORING } from "./graceful-shutdown-drops-in-flight-requests/scoring";
import { gracefulShutdownDropsInFlightRequestsCandidateUI } from "./graceful-shutdown-drops-in-flight-requests/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = gracefulShutdownDropsInFlightRequestsSimulation;
const DEPLOY_BEGINS_MS = 30_000;

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

describe("Graceful Shutdown Drops In-Flight Requests", () => {
  it("carries real library metadata, is branching-structured, senior-level, and paid", () => {
    expect(gracefulShutdownDropsInFlightRequests.structure).toBe("branching");
    expect(gracefulShutdownDropsInFlightRequests.difficulty).toBe("senior");
    expect(gracefulShutdownDropsInFlightRequests.isFree).toBe(false);
    expect(gracefulShutdownDropsInFlightRequests.library?.category).toBe("Infrastructure & Capacity");
    expect(gracefulShutdownDropsInFlightRequests.library?.primarySkill).toBeTruthy();
    expect(gracefulShutdownDropsInFlightRequests.library?.skills.length).toBeGreaterThan(0);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = gracefulShutdownDropsInFlightRequestsCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("starts healthy with no dropped requests and no pod termination grace exceeded", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.droppedRequestsPerDeploy).toBe(0);
    expect(state.values.checkoutErrorRate).toBe(0.1);
    expect(state.values.podTerminationGraceExceededCount).toBe(0);
  });

  it("a deploy begins and requests start dropping with pods getting killed before draining", () => {
    const state = runScenario(DEPLOY_BEGINS_MS + 1_000);
    expect(state.componentHealth["orders-api"]).toBe("critical");
    expect(state.values.droppedRequestsPerDeploy).toBeGreaterThan(0);
    expect(state.values.podTerminationGraceExceededCount).toBeGreaterThan(0);
  });

  it("a noise signal (order events queue lag) climbs during the incident but is unrelated to root cause", () => {
    const healthy = createInitialState(SIM);
    const dropping = runScenario(DEPLOY_BEGINS_MS + 1_000);
    expect(dropping.values.orderEventsLagMessages as number).toBeGreaterThan(
      healthy.values.orderEventsLagMessages as number,
    );
    // Lag stays roughly unchanged by the correct fix — proving it never
    // factored into successCondition/failureCondition/rules.
    const fixed = runScenario(DEPLOY_BEGINS_MS + 20_000, [
      { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
    ]);
    expect(fixed.values.orderEventsLagMessages).toBe(6);
  });

  describe("inferior investigation path", () => {
    it("scaling up replica count alone is plausible but insufficient — drops continue at the same rate", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 5_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: REPLICA_COUNT_KEY, value: 8 },
      ]);
      expect(state.values.diagnosisPath).toBe("scaled-replicas-only");
      expect(state.values.droppedRequestsPerDeploy).toBeGreaterThan(300);
      expect(state.componentHealth["orders-api"]).toBe("critical");
    });

    it("scaling replicas raises infrastructure cost without improving the drop rate", () => {
      const baseline = runScenario(DEPLOY_BEGINS_MS + 5_000);
      const scaled = runScenario(DEPLOY_BEGINS_MS + 5_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: REPLICA_COUNT_KEY, value: 12 },
      ]);
      expect(scaled.cost.currentMonthlyCostUsd).toBeGreaterThan(baseline.cost.currentMonthlyCostUsd);
      expect(scaled.values.droppedRequestsPerDeploy).toBe(baseline.values.droppedRequestsPerDeploy);
    });
  });

  describe("the correct fix — branch A: raise the drain timeout", () => {
    it("investigating all three signals, then raising the drain timeout to 15s — reaches the investigated-fix path", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
        {
          atMs: DEPLOY_BEGINS_MS + 2_000,
          controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
          value: true,
        },
        { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-then-drain-timeout-fix");
      expect(state.componentHealth["orders-api"]).toBe("healthy");
      expect(state.values.droppedRequestsPerDeploy).toBe(0);
    });

    it("investigating in a different order still reaches the same investigated-fix path — order independence", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        {
          atMs: DEPLOY_BEGINS_MS + 2_000,
          controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
          value: true,
        },
        { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 30 },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-then-drain-timeout-fix");
    });

    it("raising the drain timeout without investigating first still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-drain-timeout-fix");
      expect(state.componentHealth["orders-api"]).toBe("healthy");
    });

    it("a partial drain timeout increase (5s) relieves some pressure but is not enough", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 5_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 5 },
      ]);
      expect(state.values.diagnosisPath).toBe("partial-drain-timeout-increase");
      expect(state.values.droppedRequestsPerDeploy).toBeLessThan(340);
      expect(state.values.droppedRequestsPerDeploy).toBeGreaterThan(5);
    });
  });

  describe("the correct fix — branch B: switch deploy strategy (different tradeoff)", () => {
    it("investigating all three signals, then switching to blue-green — reaches the investigated-fix path with a slower deploy", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
        {
          atMs: DEPLOY_BEGINS_MS + 2_000,
          controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
          value: true,
        },
        { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DEPLOY_STRATEGY_KEY, value: "blue-green" },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-then-deploy-strategy-fix");
      expect(state.componentHealth["orders-api"]).toBe("healthy");
      expect(state.values.droppedRequestsPerDeploy).toBe(0);
      expect(state.values.deployDurationSeconds).toBeGreaterThan(200);
    });

    it("switching to surge is also a valid investigated fix, with a smaller deploy-duration cost than blue-green", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
        {
          atMs: DEPLOY_BEGINS_MS + 2_000,
          controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
          value: true,
        },
        { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DEPLOY_STRATEGY_KEY, value: "surge" },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-then-deploy-strategy-fix");
      expect(state.values.droppedRequestsPerDeploy).toBe(0);
      expect(state.values.deployDurationSeconds).toBeLessThan(240);
      expect(state.values.deployDurationSeconds).toBeGreaterThan(150);
    });

    it("switching deploy strategy without investigating first still resolves, but as a guessed fix", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DEPLOY_STRATEGY_KEY, value: "blue-green" },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-deploy-strategy-fix");
      expect(state.componentHealth["orders-api"]).toBe("healthy");
    });

    it("blue-green and surge cost more in infrastructure than the drain-timeout fix — the branching tradeoff", () => {
      const drainTimeoutFix = runScenario(DEPLOY_BEGINS_MS + 5_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);
      const blueGreenFix = runScenario(DEPLOY_BEGINS_MS + 5_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DEPLOY_STRATEGY_KEY, value: "blue-green" },
      ]);
      expect(blueGreenFix.cost.currentMonthlyCostUsd).toBeGreaterThan(
        drainTimeoutFix.cost.currentMonthlyCostUsd,
      );
    });
  });

  it("verification: successCondition requires dropped requests, error rate, and grace-exceeded count all recovered together", () => {
    const state = runScenario(DEPLOY_BEGINS_MS + 20_000, [
      { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after pod termination grace exceeded remains critical past the old sustained window", () => {
    const state = runScenario(DEPLOY_BEGINS_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
      { atMs: DEPLOY_BEGINS_MS + 2_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
    ];
    const runA = runScenario(DEPLOY_BEGINS_MS + 10_000, actions);
    const runB = runScenario(DEPLOY_BEGINS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(GRACEFUL_SHUTDOWN_DROPS_IN_FLIGHT_REQUESTS_SCORING, inputs);
    }

    it("a candidate who investigates before fixing scores strictly higher than one who guesses the same fix", () => {
      const investigated = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
        {
          atMs: DEPLOY_BEGINS_MS + 2_000,
          controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
          value: true,
        },
        { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);
      const guessed = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);

      expect(scoreOf(investigated).total).toBeGreaterThan(scoreOf(guessed).total);
    });

    it("a candidate who chases the inferior replica-scaling remediation scores lower than one who takes a correct investigated path", () => {
      const investigated = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
        {
          atMs: DEPLOY_BEGINS_MS + 2_000,
          controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
          value: true,
        },
        { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);
      const randomExploration = runScenario(5 * 60_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: REPLICA_COUNT_KEY, value: 8 },
        { atMs: DEPLOY_BEGINS_MS + 30_000, controlKey: REPLICA_COUNT_KEY, value: 12 },
      ]);

      expect(scoreOf(investigated).total).toBeGreaterThan(scoreOf(randomExploration).total);
    });

    it("the two correct investigated branches (drain timeout vs. deploy strategy) score identically on dataIntegrity", () => {
      const drainTimeoutBranch = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
        {
          atMs: DEPLOY_BEGINS_MS + 2_000,
          controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
          value: true,
        },
        { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);
      const deployStrategyBranch = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
        {
          atMs: DEPLOY_BEGINS_MS + 2_000,
          controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
          value: true,
        },
        { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DEPLOY_STRATEGY_KEY, value: "blue-green" },
      ]);

      expect(scoreOf(drainTimeoutBranch).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(deployStrategyBranch).breakdown.dataIntegrity).toBe(200);
    });

    it("the dataIntegrity dimension awards a lower band for a guessed fix than an investigated one", () => {
      const investigated = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
        {
          atMs: DEPLOY_BEGINS_MS + 2_000,
          controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
          value: true,
        },
        { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);
      const guessed = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);

      expect(scoreOf(investigated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(80);
    });

    it("the deploy-strategy branch costs more in costEfficiency than the drain-timeout branch — the branching tradeoff reflected in scoring", () => {
      const drainTimeoutBranch = runScenario(DEPLOY_BEGINS_MS + 5_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
      ]);
      const deployStrategyBranch = runScenario(DEPLOY_BEGINS_MS + 5_000, [
        { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: DEPLOY_STRATEGY_KEY, value: "blue-green" },
      ]);

      expect(scoreOf(deployStrategyBranch).breakdown.costEfficiency).toBeLessThanOrEqual(
        scoreOf(drainTimeoutBranch).breakdown.costEfficiency,
      );
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const investigated = runScenario(DEPLOY_BEGINS_MS + 20_000, [
        { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
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
    it("surfaces pod termination grace exceeded as the root cause and dropped requests/error rate as observed effects", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        gracefulShutdownDropsInFlightRequestsCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Pods Killed Before Drain Completed");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Dropped Requests Per Deploy", "Checkout Error Rate"]),
      );
      expect(narrative.context.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Deploy Duration", "CPU Throttle"]),
      );
    });

    it("never surfaces the noise-tagged order events queue lag in any narrative group", () => {
      const state = runScenario(DEPLOY_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        gracefulShutdownDropsInFlightRequestsCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Order Events Queue Lag")).toBe(false);
    });
  });
});
