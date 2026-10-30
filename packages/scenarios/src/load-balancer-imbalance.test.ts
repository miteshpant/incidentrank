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
import { loadBalancerImbalance } from "./load-balancer-imbalance";
import {
  BALANCING_STRATEGY_KEY,
  CONNECTION_DRAINING_ENABLED_KEY,
  HEALTH_CHECK_SENSITIVITY_KEY,
  INSTANCE_COUNT_KEY,
  loadBalancerImbalanceSimulation,
  STICKY_SESSIONS_ENABLED_KEY,
  TRAFFIC_WEIGHTS_KEY,
} from "./load-balancer-imbalance/definition";
import { loadBalancerImbalanceCandidateUI } from "./load-balancer-imbalance/candidate-ui";
import { LOAD_BALANCER_IMBALANCE_SCORING } from "./load-balancer-imbalance/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(loadBalancerImbalanceSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += loadBalancerImbalanceSimulation.tickMs
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
      loadBalancerImbalanceSimulation,
      state,
      action,
      loadBalancerImbalanceSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const SESSION_SURGE_MS = 30_000;
const STALE_HEALTH_CHECK_COMPOUNDING_MS = SESSION_SURGE_MS + 3 * 60_000;

describe("Load Balancer Imbalance", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(loadBalancerImbalance.isFree).toBe(false);
      expect(loadBalancerImbalance.library?.category).toBe("API & Traffic");
      expect(loadBalancerImbalance.library?.tags.length).toBeGreaterThan(0);
      expect(loadBalancerImbalance.library?.skills.length).toBeGreaterThan(0);
      expect(loadBalancerImbalance.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = LOAD_BALANCER_IMBALANCE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = LOAD_BALANCER_IMBALANCE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(loadBalancerImbalanceCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(loadBalancerImbalanceCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(loadBalancerImbalanceCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(loadBalancerImbalanceCandidateUI.components.length).toBe(6);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(loadBalancerImbalanceSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.globalSuccessRatePct).toBe(100);
      expect(state.values.imbalanceRootCause).toBe("unresolved");
    });

    it("session surge triggers the unmitigated-skew baseline incident", () => {
      const state = runScenario(SESSION_SURGE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(SESSION_SURGE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.instanceARequestRate).toBe(880);
      expect(state.values.instanceCRequestRate).toBe(101);
      expect(state.values.balancerStatus).toBe("critical");
    });

    it("strong path: switching balancing strategy to leastConnections resolves the skew", () => {
      const state = runScenario(SESSION_SURGE_MS + 20_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: BALANCING_STRATEGY_KEY, value: "leastConnections" },
      ]);
      expect(state.values.instanceARequestRate).toBe(102);
      expect(state.values.instanceCRequestRate).toBe(99);
      expect(state.values.imbalanceRootCause).toBe("rebalanced");
      expect(state.values.balancerStatus).toBe("normal");
    });

    it("strong path: disabling sticky sessions outright also resolves the skew", () => {
      const state = runScenario(SESSION_SURGE_MS + 20_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: STICKY_SESSIONS_ENABLED_KEY, value: false },
      ]);
      expect(state.values.imbalanceRootCause).toBe("rebalanced");
      expect(state.values.balancerStatus).toBe("normal");
      expect(state.values.instanceAConnectionCount).toBe(58);
    });

    it("REQUIRED PROPERTY: raising instance count alone does not relieve the skew", () => {
      const baseline = runScenario(SESSION_SURGE_MS + 20_000);
      const scaled = runScenario(SESSION_SURGE_MS + 20_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: INSTANCE_COUNT_KEY, value: 8 },
      ]);

      // Instance A stays effectively as overloaded as baseline — new
      // capacity never relieves clients already pinned there.
      expect(scaled.values.instanceARequestRate).toBe(870);
      expect(scaled.values.instanceAConnectionCount).toBe(980);
      expect(scaled.values.balancerStatus).toBe("critical");
      expect(scaled.values.imbalanceRootCause).toBe("capacity-added");
      // Healthy backend count rose (new instances exist and are
      // healthy) but that did not translate into relief.
      expect(scaled.values.healthyBackendCount).toBe(8);
      expect(scaled.values.instanceARequestRate).toBeGreaterThanOrEqual(
        (baseline.values.instanceARequestRate as number) - 20,
      );
    });

    it("harmful trap: lowering traffic weights on hot instances alone also fails to relieve the skew", () => {
      const state = runScenario(SESSION_SURGE_MS + 20_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: TRAFFIC_WEIGHTS_KEY, value: "favorLightInstances" },
      ]);
      expect(state.values.instanceAConnectionCount).toBe(960);
      expect(state.values.balancerStatus).toBe("critical");
      expect(state.values.imbalanceRootCause).toBe("capacity-added");
    });

    it("partial path: sensitive health check alone contains but does not resolve the skew", () => {
      const state = runScenario(SESSION_SURGE_MS + 20_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: HEALTH_CHECK_SENSITIVITY_KEY, value: "sensitive" },
      ]);
      expect(state.values.healthyBackendCount).toBe(3);
      expect(state.values.instanceAConnectionCount).toBe(560);
      expect(state.values.balancerStatus).toBe("warning");
      expect(state.values.imbalanceRootCause).toBe("unresolved");
    });

    it("acceptable path: connection draining clears the skew by forcing a reset, not fixing the mechanism", () => {
      const state = runScenario(SESSION_SURGE_MS + 20_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: CONNECTION_DRAINING_ENABLED_KEY, value: true },
      ]);
      expect(state.values.instanceAConnectionCount).toBe(60);
      expect(state.values.globalSuccessRatePct).toBe(97);
      expect(state.values.imbalanceRootCause).toBe("unresolved");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(SESSION_SURGE_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.balancerStatus).toBe("critical");
    });

    it("delayed consequence: unmitigated load compounds on a second wave with visible precursor", () => {
      const beforeSecondWave = runScenario(SESSION_SURGE_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.instanceAConnectionCount).toBeGreaterThanOrEqual(900);
      expect(beforeSecondWave.values.instanceALatencyMs).toBeGreaterThan(1_000);

      const afterSecondWave = runScenario(STALE_HEALTH_CHECK_COMPOUNDING_MS + 5_000);
      expect(afterSecondWave.values.instanceAConnectionCount).toBe(1_480);
      expect(afterSecondWave.values.globalSuccessRatePct).toBe(72);
    });

    it("stays active (never auto-fails) even after global success rate remains at or below 75% past the old sustained window", () => {
      const state = runScenario(STALE_HEALTH_CHECK_COMPOUNDING_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        loadBalancerImbalanceSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak instance A connection count and latency generically via numericWatchFields", () => {
      const state = runScenario(SESSION_SURGE_MS + 1_000);
      expect(state.peaks.peakValues.instanceAConnectionCount).toBe(1_000);
      expect(state.peaks.peakValues.instanceALatencyMs).toBe(1_400);
    });

    it("tracks monthly infrastructure cost that increases with instance count", () => {
      let state = createInitialState(loadBalancerImbalanceSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(320);
      state = simulate(
        loadBalancerImbalanceSimulation,
        state,
        { id: "scale", timestampMs: 0, controlKey: INSTANCE_COUNT_KEY, value: 12 },
        loadBalancerImbalanceSimulation.tickMs,
      ).state;
      expect(state.cost.currentMonthlyCostUsd).toBe(320 + 640);
    });
  });

  describe("Phase 6.1: two-tier completion — rebalanced (optimal) vs drained (acceptable)", () => {
    it("rebalanced via strategy change, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: BALANCING_STRATEGY_KEY, value: "leastConnections" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(loadBalancerImbalanceSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("connection draining, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: CONNECTION_DRAINING_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(loadBalancerImbalanceSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("sensitive health check alone remains ineligible for any Finish tier", () => {
      const state = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: HEALTH_CHECK_SENSITIVITY_KEY, value: "sensitive" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(loadBalancerImbalanceSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("instance count scaled alone (the required trap) remains ineligible for any Finish tier", () => {
      const state = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: INSTANCE_COUNT_KEY, value: 12 },
      ]);
      const eligibility = evaluateCompletionEligibility(loadBalancerImbalanceSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: BALANCING_STRATEGY_KEY, value: "leastConnections" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        loadBalancerImbalanceSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: CONNECTION_DRAINING_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        loadBalancerImbalanceSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: BALANCING_STRATEGY_KEY, value: "leastConnections" },
      ]);
      const result = evaluateCandidateDeclaredFinish(loadBalancerImbalanceSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: CONNECTION_DRAINING_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(loadBalancerImbalanceSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(SESSION_SURGE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(loadBalancerImbalanceSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("declared_unstable still fires on a sustained breach even though the engine itself never auto-fails", () => {
      const state = runScenario(STALE_HEALTH_CHECK_COMPOUNDING_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        loadBalancerImbalanceSimulation.failureCondition.sustainedSeconds,
      );
      const result = evaluateCandidateDeclaredFinish(loadBalancerImbalanceSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("IMMEDIATE-FINISH AUDIT: zero-action Finish at t=0 does not resolve, even though pre-incident health trivially looks safe", () => {
      const state = runScenario(0);
      expect(state.status).toBe("healthy");
      expect(state.incidentStartedAtMs).toBeNull();
      const eligibility = evaluateCompletionEligibility(loadBalancerImbalanceSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(loadBalancerImbalanceSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("IMMEDIATE-FINISH AUDIT: zero-action Finish right as the incident starts also does not resolve", () => {
      const state = runScenario(SESSION_SURGE_MS + 1_000);
      expect(state.status).toBe("critical");
      const result = evaluateCandidateDeclaredFinish(loadBalancerImbalanceSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: BALANCING_STRATEGY_KEY, value: "leastConnections" },
      ];
      const runA = runScenario(SESSION_SURGE_MS + 20_000, actions);
      const runB = runScenario(SESSION_SURGE_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (rebalanced), acceptable (drained), baseline, and harmful (instance count trap) paths with coherent ordering", () => {
      const goodState = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: BALANCING_STRATEGY_KEY, value: "leastConnections" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(loadBalancerImbalanceSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        LOAD_BALANCER_IMBALANCE_SCORING,
        extractFinishScoringInputs(loadBalancerImbalanceSimulation, goodFinish),
      );

      const acceptableState = runScenario(SESSION_SURGE_MS + 35_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: CONNECTION_DRAINING_ENABLED_KEY, value: true },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        loadBalancerImbalanceSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        LOAD_BALANCER_IMBALANCE_SCORING,
        extractFinishScoringInputs(loadBalancerImbalanceSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(SESSION_SURGE_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        LOAD_BALANCER_IMBALANCE_SCORING,
        extractScoringInputs(loadBalancerImbalanceSimulation, baselineState),
      );

      const harmfulState = runScenario(SESSION_SURGE_MS + 20_000, [
        { atMs: SESSION_SURGE_MS + 1_000, controlKey: INSTANCE_COUNT_KEY, value: 8 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        LOAD_BALANCER_IMBALANCE_SCORING,
        extractScoringInputs(loadBalancerImbalanceSimulation, harmfulState),
      );

      // NOTE (section 16/17 suspicious-tie investigation): reliability
      // legitimately floors at 15 for good/acceptable/baseline/harmful
      // alike here — every mitigated path in this test fixes one tick
      // after incident start, so criticalTimeRatio's tiny denominator
      // on a near-instant fix hits the floor band regardless of path.
      // This is the same pre-existing, already-accepted engine-wide
      // criticalTimeRatio-floor artifact documented in Missing Database
      // Index's own test suite (also present in Kafka Partition Skew's
      // fastest-recovery path) — not something this scenario's scoring
      // redesigns, per phase6c.md section 18. dataIntegrity is the
      // dimension that correctly discriminates optimal ("rebalanced")
      // from acceptable (forced reset) from the required capacity trap,
      // which is why the totals still differ correctly.
      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(795);
      expect(baselineScore.total).toBe(495);
      expect(harmfulScore.total).toBe(375);

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });

    it("scores an immediate zero-action Finish attempt as unresolved, never inflated", () => {
      const state = runScenario(0);
      const score = scoreAuthoredAttempt(
        LOAD_BALANCER_IMBALANCE_SCORING,
        extractScoringInputs(loadBalancerImbalanceSimulation, state),
      );
      // unresolved terminal overrides: recovery=0; reliability uses its
      // own unresolved override (15) rather than falling through to a
      // band computation with an infinite/undefined measure.
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(15);
    });
  });
});
