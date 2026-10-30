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
import { multiServiceMemoryPressureIncident } from "./multi-service-memory-pressure-incident";
import {
  AGGREGATION_CONCURRENCY_KEY,
  API_CONCURRENCY_KEY,
  CACHE_POLICY_KEY,
  DEPENDENCY_A_INSTANCE_COUNT_KEY,
  MAX_RESPONSE_SIZE_KEY,
  multiServiceMemoryPressureIncidentSimulation,
  PARTIAL_RESPONSE_MODE_KEY,
  RESPONSE_FIELD_SET_MODE_KEY,
  WORKER_COUNT_KEY,
} from "./multi-service-memory-pressure-incident/definition";
import { multiServiceMemoryPressureIncidentCandidateUI } from "./multi-service-memory-pressure-incident/candidate-ui";
import { MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING } from "./multi-service-memory-pressure-incident/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(multiServiceMemoryPressureIncidentSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += multiServiceMemoryPressureIncidentSimulation.tickMs
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
      multiServiceMemoryPressureIncidentSimulation,
      state,
      action,
      multiServiceMemoryPressureIncidentSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const SHAPE_CHANGE_SHIPPED_MS = 30_000;
const DEPENDENCY_A_GC_THRASHING_MS = SHAPE_CHANGE_SHIPPED_MS + 40_000;
const DECAY_WINDOW_1_MS = DEPENDENCY_A_GC_THRASHING_MS + 20_000;
const DECAY_WINDOW_2_MS = DEPENDENCY_A_GC_THRASHING_MS + 50_000;
const DECAY_WINDOW_FULLY_RECOVERED_MS = DEPENDENCY_A_GC_THRASHING_MS + 90_000;
const UNMITIGATED_SPREAD_MS = DEPENDENCY_A_GC_THRASHING_MS + 110_000;
const DECOY_SCALING_REACCUMULATION_MS = DEPENDENCY_A_GC_THRASHING_MS + 140_000;
const OOM_CHURN_ONSET_MS = DEPENDENCY_A_GC_THRASHING_MS + 170_000;

describe("Multi-Service Memory Pressure Incident", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid, senior_staff scenario", () => {
      expect(multiServiceMemoryPressureIncident.isFree).toBe(false);
      expect(multiServiceMemoryPressureIncident.difficulty).toBe("senior_staff");
      expect(multiServiceMemoryPressureIncident.library?.category).toBe("Infrastructure & Capacity");
      expect(multiServiceMemoryPressureIncident.library?.tags.length).toBeGreaterThan(0);
      expect(multiServiceMemoryPressureIncident.library?.skills.length).toBeGreaterThan(0);
    });

    it("states business invariants explicitly in the description", () => {
      const description = multiServiceMemoryPressureIncident.description;
      expect(description).toMatch(/reduced enrichment/i);
      expect(description).toMatch(/restart\/OOM churn/i);
      expect(description).toMatch(/correctness bound/i);
      expect(description).toMatch(/not a durable fix/i);
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(multiServiceMemoryPressureIncidentCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(multiServiceMemoryPressureIncidentCandidateUI.controls.length).toBe(8);
      expect(multiServiceMemoryPressureIncidentCandidateUI.components.length).toBe(7);
    });

    it("architecture is the flat seven-node fan-out: Clients -> Gateway -> API -> Aggregator -> {A,B,C}", () => {
      const { nodes, edges } = multiServiceMemoryPressureIncidentSimulation.architecture;
      expect(nodes.length).toBe(7);
      expect(edges.length).toBe(6);
      expect(edges).toEqual(
        expect.arrayContaining([
          { from: "clients", to: "gateway" },
          { from: "gateway", to: "api-service" },
          { from: "api-service", to: "aggregator" },
          { from: "aggregator", to: "dependency-a" },
          { from: "aggregator", to: "dependency-b" },
          { from: "aggregator", to: "dependency-c" },
        ]),
      );
    });
  });

  describe("Runtime / timeline", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(multiServiceMemoryPressureIncidentSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.rootCauseHealth).toBe("unaddressed");
      expect(state.values.restartChurnCount).toBe(0);
    });

    it("shape change ships before Dependency A starts GC-thrashing, giving an early warning across all components", () => {
      const state = runScenario(SHAPE_CHANGE_SHIPPED_MS + 1_000);
      expect(state.values.aggregatorMemoryUtilizationPct).toBe(40);
      expect(state.values.dependencyBMemoryUtilizationPct).toBe(32);
      expect(state.values.dependencyCMemoryUtilizationPct).toBe(32);
      // Dependency A is not yet GC-thrashing specifically.
      expect(state.values.gcPauseMsP99).toBe(90);
    });

    it("Dependency A begins GC-thrashing, becoming the misleading decoy symptom", () => {
      const state = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(SHAPE_CHANGE_SHIPPED_MS);
      expect(state.status).toBe("degraded");
      expect(state.componentHealth["dependency-a"]).toBe("critical");
      // Root cause is upstream — the Aggregator — not Dependency A itself.
      expect(state.values.aggregatorMemoryUtilizationPct).toBe(62);
      expect(state.values.rootCauseHealth).toBe("unaddressed");
    });

    it("unmitigated, Dependency B and C eventually degrade too — proving the cause was never Dependency-A-specific", () => {
      const state = runScenario(UNMITIGATED_SPREAD_MS + 1_000);
      expect(state.componentHealth["dependency-b"]).toBe("degraded");
      expect(state.componentHealth["dependency-c"]).toBe("degraded");
      expect(state.values.dependencyBMemoryUtilizationPct).toBe(74);
      expect(state.values.dependencyCMemoryUtilizationPct).toBe(74);
    });

    it("unmitigated long enough, the fleet enters real OOM/restart churn", () => {
      const state = runScenario(OOM_CHURN_ONSET_MS + 1_000);
      expect(state.values.restartChurnCount).toBe(7);
      expect(state.values.fleetIntegrityHealth).toBe("churn-scarred");
      expect(state.componentHealth["dependency-b"]).toBe("critical");
      expect(state.componentHealth["dependency-c"]).toBe("critical");
    });

    it("baseline (no action) never self-resolves, but stays active (never auto-fails) even once the failure condition has sustained past its own window", () => {
      const state = runScenario(OOM_CHURN_ONSET_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        multiServiceMemoryPressureIncidentSimulation.failureCondition.sustainedSeconds,
      );
    });
  });

  describe("Root cause fix #1: response field set (recovery lag proof)", () => {
    const fixActions: TimedAction[] = [
      { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: RESPONSE_FIELD_SET_MODE_KEY, value: "reduced" },
    ];

    it("just applied: no instant drop — pressure is still near baseline the same tick", () => {
      const state = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 2_000, fixActions);
      expect(state.values.rootCauseHealth).toBe("addressed-pending-decay");
      expect(state.values.memoryPressureHealth).toBe("decaying");
      expect(state.values.gcPauseMsP99).toBe(240);
      expect(state.values.aggregatorMemoryUtilizationPct).toBe(58);
    });

    it("decays further across decay window 1, then window 2, before reaching clear", () => {
      const window1State = runScenario(DECAY_WINDOW_1_MS + 1_000, fixActions);
      expect(window1State.values.gcPauseMsP99).toBe(130);
      expect(window1State.values.memoryPressureHealth).toBe("decaying");

      const window2State = runScenario(DECAY_WINDOW_2_MS + 1_000, fixActions);
      expect(window2State.values.gcPauseMsP99).toBe(70);
      expect(window2State.values.memoryPressureHealth).toBe("decaying");

      // Genuine monotonic decay, never instant.
      expect(window2State.values.gcPauseMsP99 as number).toBeLessThan(window1State.values.gcPauseMsP99 as number);
    });

    it("fully recovered once the decay window has genuinely elapsed", () => {
      const state = runScenario(DECAY_WINDOW_FULLY_RECOVERED_MS + 1_000, fixActions);
      expect(state.values.rootCauseHealth).toBe("resolved");
      expect(state.values.memoryPressureHealth).toBe("clear");
      expect(state.values.aggregatorStatus).toBe("normal");
      expect(state.values.customerEnrichmentCompletenessPct).toBe(100);
      expect(state.values.restartChurnCount).toBe(0);
    });
  });

  describe("Root cause fix #2 (alternate strong path): aggregation concurrency", () => {
    const fixActions: TimedAction[] = [
      { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: AGGREGATION_CONCURRENCY_KEY, value: 10 },
    ];

    it("decays over real elapsed time, structurally different from the field-set fix", () => {
      const window1State = runScenario(DECAY_WINDOW_1_MS + 1_000, fixActions);
      expect(window1State.values.rootCauseHealth).toBe("addressed-pending-decay");
      expect(window1State.values.gcPauseMsP99).toBe(135);
    });

    it("fully recovered, reaching the same safe bar as fix #1 via a genuinely different mechanism", () => {
      const state = runScenario(DECAY_WINDOW_FULLY_RECOVERED_MS + 1_000, fixActions);
      expect(state.values.rootCauseHealth).toBe("resolved");
      expect(state.values.memoryPressureHealth).toBe("clear");
      expect(state.values.aggregatorStatus).toBe("normal");
      // Different responsePayloadSizeKb than fix #1 proves this is a
      // genuinely different mechanism, not a relabeled duplicate.
      expect(state.values.responsePayloadSizeKb).toBe(95);
    });
  });

  describe("Tempting path / pressure transfer: scaling the decoy (Dependency A)", () => {
    const decoyScaleActions: TimedAction[] = [
      { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: DEPENDENCY_A_INSTANCE_COUNT_KEY, value: 8 },
    ];

    it("gives real, measurable temporary relief on Dependency A specifically", () => {
      const baseline = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000);
      const scaled = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, decoyScaleActions);

      expect(scaled.values.dependencyAMemoryUtilizationPct as number).toBeLessThan(
        baseline.values.dependencyAMemoryUtilizationPct as number,
      );
      // Root cause remains untouched.
      expect(scaled.values.rootCauseHealth).toBe("unaddressed");
    });

    it("pressure transfers onto Dependency B and C, which were never scaled", () => {
      const baseline = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000);
      const scaled = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, decoyScaleActions);

      expect(scaled.values.dependencyBMemoryUtilizationPct as number).toBeGreaterThan(
        baseline.values.dependencyBMemoryUtilizationPct as number,
      );
      expect(scaled.values.dependencyCMemoryUtilizationPct as number).toBeGreaterThan(
        baseline.values.dependencyCMemoryUtilizationPct as number,
      );
    });

    it("pressure persists: Dependency A's own relief re-accumulates once the reaccumulation window elapses", () => {
      const temporaryReliefState = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, decoyScaleActions);
      const reaccumulatedState = runScenario(DECOY_SCALING_REACCUMULATION_MS + 1_000, decoyScaleActions);

      expect(reaccumulatedState.values.dependencyAMemoryUtilizationPct as number).toBeGreaterThan(
        temporaryReliefState.values.dependencyAMemoryUtilizationPct as number,
      );
      expect(reaccumulatedState.values.aggregatorStatus).toBe("critical");
      expect(reaccumulatedState.values.rootCauseHealth).toBe("unaddressed");
    });

    it("never eligible for any Finish tier, since the root cause was never addressed", () => {
      const state = runScenario(DECOY_SCALING_REACCUMULATION_MS + 1_000, decoyScaleActions);
      expect(evaluateCompletionEligibility(multiServiceMemoryPressureIncidentSimulation, state)).toEqual({
        eligible: false,
      });
    });
  });

  describe("Historical damage: restart churn does not reset once a fix is applied", () => {
    it("fixing the root cause after churn already occurred leaves restartChurnCount frozen, never reset", () => {
      const state = runScenario(OOM_CHURN_ONSET_MS + 90_000 + 1_000, [
        { atMs: OOM_CHURN_ONSET_MS + 1_000, controlKey: RESPONSE_FIELD_SET_MODE_KEY, value: "reduced" },
      ]);
      expect(state.values.rootCauseHealth).toBe("resolved");
      expect(state.values.memoryPressureHealth).toBe("clear");
      // Current health is clean, but the historical scar is NOT erased.
      expect(state.values.restartChurnCount).toBe(7);
      expect(state.values.fleetIntegrityHealth).toBe("churn-scarred");
    });

    it("the clean, never-churned path keeps restartChurnCount at zero throughout", () => {
      const state = runScenario(DECAY_WINDOW_FULLY_RECOVERED_MS + 1_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: RESPONSE_FIELD_SET_MODE_KEY, value: "reduced" },
      ]);
      expect(state.values.restartChurnCount).toBe(0);
      expect(state.values.fleetIntegrityHealth).toBe("never-churned");
    });
  });

  describe("Correctness-bound truncation trap", () => {
    it("truncating past the correctness bound violates enrichment completeness regardless of calm memory numbers", () => {
      const state = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: MAX_RESPONSE_SIZE_KEY, value: "64kb" },
      ]);
      expect(state.values.customerEnrichmentCompletenessPct).toBe(38);
      expect(state.values.errorRatePct).toBe(26);
      expect(state.values.rootCauseHealth).toBe("unaddressed");
      expect(evaluateCompletionEligibility(multiServiceMemoryPressureIncidentSimulation, state)).toEqual({
        eligible: false,
      });
    });
  });

  describe("Harmful: scaling the wrong location, or feeding more demand", () => {
    it("scaling Aggregator worker count alone worsens Aggregator pressure relative to baseline", () => {
      const baseline = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000);
      const scaled = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: WORKER_COUNT_KEY, value: 32 },
      ]);
      expect(scaled.values.aggregatorMemoryUtilizationPct as number).toBeGreaterThan(
        baseline.values.aggregatorMemoryUtilizationPct as number,
      );
      expect(scaled.values.aggregatorStatus).toBe("critical");
    });

    it("raising API concurrency alone worsens pressure across the Aggregator and every dependency", () => {
      const baseline = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000);
      const scaled = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: 400 },
      ]);
      expect(scaled.values.aggregatorMemoryUtilizationPct as number).toBeGreaterThan(
        baseline.values.aggregatorMemoryUtilizationPct as number,
      );
      expect(scaled.values.dependencyBMemoryUtilizationPct as number).toBeGreaterThan(
        baseline.values.dependencyBMemoryUtilizationPct as number,
      );
    });
  });

  describe("Partial mitigations", () => {
    it("cache policy alone gives real but incomplete relief", () => {
      const baseline = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000);
      const cached = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: CACHE_POLICY_KEY, value: "on" },
      ]);
      expect(cached.values.aggregatorMemoryUtilizationPct as number).toBeLessThan(
        baseline.values.aggregatorMemoryUtilizationPct as number,
      );
      expect(cached.values.rootCauseHealth).toBe("unaddressed");
      expect(evaluateCompletionEligibility(multiServiceMemoryPressureIncidentSimulation, cached)).toEqual({
        eligible: false,
      });
    });

    it("partial response mode protects the fleet from churn without fixing the root cause", () => {
      const state = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: PARTIAL_RESPONSE_MODE_KEY, value: "enabled" },
      ]);
      expect(state.values.customerEnrichmentCompletenessPct).toBe(88);
      expect(state.values.errorRatePct).toBe(0);
      expect(state.values.aggregatorStatus).not.toBe("critical");
      expect(state.values.rootCauseHealth).toBe("unaddressed");
    });
  });

  describe("Candidate-declared completion", () => {
    it("the full recovery (field-set fix, decayed) is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(DECAY_WINDOW_FULLY_RECOVERED_MS + 16_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: RESPONSE_FIELD_SET_MODE_KEY, value: "reduced" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(evaluateCompletionEligibility(multiServiceMemoryPressureIncidentSimulation, state)).toEqual({
        eligible: true,
        tier: "optimal",
      });
    });

    it("the alternate concurrency fix is also eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(DECAY_WINDOW_FULLY_RECOVERED_MS + 16_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: AGGREGATION_CONCURRENCY_KEY, value: 10 },
      ]);
      expect(evaluateCompletionEligibility(multiServiceMemoryPressureIncidentSimulation, state)).toEqual({
        eligible: true,
        tier: "optimal",
      });
    });

    it("partial response mode alone is eligible for an ACCEPTABLE-tier Finish, not optimal", () => {
      const state = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: PARTIAL_RESPONSE_MODE_KEY, value: "enabled" },
      ]);
      expect(evaluateCompletionEligibility(multiServiceMemoryPressureIncidentSimulation, state)).toEqual({
        eligible: true,
        tier: "acceptable",
      });
    });

    it("decoy scaling alone is NOT eligible for any Finish tier", () => {
      const state = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: DEPENDENCY_A_INSTANCE_COUNT_KEY, value: 8 },
      ]);
      expect(evaluateCompletionEligibility(multiServiceMemoryPressureIncidentSimulation, state)).toEqual({
        eligible: false,
      });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(DECAY_WINDOW_FULLY_RECOVERED_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: RESPONSE_FIELD_SET_MODE_KEY, value: "reduced" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(DECAY_WINDOW_FULLY_RECOVERED_MS + 16_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: RESPONSE_FIELD_SET_MODE_KEY, value: "reduced" },
      ]);
      const result = evaluateCandidateDeclaredFinish(multiServiceMemoryPressureIncidentSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: PARTIAL_RESPONSE_MODE_KEY, value: "enabled" },
      ]);
      const result = evaluateCandidateDeclaredFinish(multiServiceMemoryPressureIncidentSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("IMMEDIATE-FINISH AUDIT: zero actions -> Finish immediately after incident onset yields declared_unstable", () => {
      const state = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 1_000);
      const result = evaluateCandidateDeclaredFinish(multiServiceMemoryPressureIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the decoy-scaling pressure-transfer state -> declared_unstable, not acceptable", () => {
      const state = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: DEPENDENCY_A_INSTANCE_COUNT_KEY, value: 8 },
      ]);
      const result = evaluateCandidateDeclaredFinish(multiServiceMemoryPressureIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("sustained breach alone never auto-fails in candidate_declared mode either — Finish still yields declared_unstable", () => {
      const state = runScenario(OOM_CHURN_ONSET_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        multiServiceMemoryPressureIncidentSimulation.failureCondition.sustainedSeconds,
      );
      const result = evaluateCandidateDeclaredFinish(multiServiceMemoryPressureIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: DEPENDENCY_A_INSTANCE_COUNT_KEY, value: 8 },
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 5_000, controlKey: CACHE_POLICY_KEY, value: "on" },
      ];
      const runA = runScenario(DECOY_SCALING_REACCUMULATION_MS + 10_000, actions);
      const runB = runScenario(DECOY_SCALING_REACCUMULATION_MS + 10_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical events for the same action sequence run twice", () => {
      let stateA = createInitialState(multiServiceMemoryPressureIncidentSimulation);
      let stateB = createInitialState(multiServiceMemoryPressureIncidentSimulation);
      const eventsA: string[] = [];
      const eventsB: string[] = [];
      const tickMs = multiServiceMemoryPressureIncidentSimulation.tickMs;
      const action: CandidateAction = {
        id: "apply-fix",
        timestampMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000,
        controlKey: RESPONSE_FIELD_SET_MODE_KEY,
        value: "reduced",
      };

      for (let t = 0; t < DECAY_WINDOW_FULLY_RECOVERED_MS + 5_000; t += tickMs) {
        const act = t === action.timestampMs ? action : null;
        const resultA = simulate(multiServiceMemoryPressureIncidentSimulation, stateA, act, tickMs);
        const resultB = simulate(multiServiceMemoryPressureIncidentSimulation, stateB, act, tickMs);
        stateA = resultA.state;
        stateB = resultB.state;
        eventsA.push(...resultA.events.map((e) => e.type));
        eventsB.push(...resultB.events.map((e) => e.type));
      }

      expect(eventsA).toEqual(eventsB);
      expect(stateA).toEqual(stateB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal, alternate-optimal, acceptable, harmful, and baseline paths with coherent ordering", () => {
      const optimalState = runScenario(DECAY_WINDOW_FULLY_RECOVERED_MS + 16_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: RESPONSE_FIELD_SET_MODE_KEY, value: "reduced" },
      ]);
      const optimalFinish = evaluateCandidateDeclaredFinish(multiServiceMemoryPressureIncidentSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
        extractFinishScoringInputs(multiServiceMemoryPressureIncidentSimulation, optimalFinish),
      );

      const altOptimalState = runScenario(DECAY_WINDOW_FULLY_RECOVERED_MS + 16_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: AGGREGATION_CONCURRENCY_KEY, value: 10 },
      ]);
      const altOptimalFinish = evaluateCandidateDeclaredFinish(
        multiServiceMemoryPressureIncidentSimulation,
        altOptimalState,
      );
      const altOptimalScore = scoreAuthoredAttempt(
        MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
        extractFinishScoringInputs(multiServiceMemoryPressureIncidentSimulation, altOptimalFinish),
      );

      const acceptableState = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: PARTIAL_RESPONSE_MODE_KEY, value: "enabled" },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        multiServiceMemoryPressureIncidentSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
        extractFinishScoringInputs(multiServiceMemoryPressureIncidentSimulation, acceptableFinish),
      );

      // Historical-damage score-sanity proof (phase6d.4.md section 17):
      // the root cause is fixed and current health is clean, but the
      // restart-churn scar occurred earlier — never score this as
      // perfectly as the clean optimal path.
      const churnScarredState = runScenario(OOM_CHURN_ONSET_MS + 90_000 + 16_000, [
        { atMs: OOM_CHURN_ONSET_MS + 1_000, controlKey: RESPONSE_FIELD_SET_MODE_KEY, value: "reduced" },
      ]);
      const churnScarredFinish = evaluateCandidateDeclaredFinish(
        multiServiceMemoryPressureIncidentSimulation,
        churnScarredState,
      );
      const churnScarredScore = scoreAuthoredAttempt(
        MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
        extractFinishScoringInputs(multiServiceMemoryPressureIncidentSimulation, churnScarredFinish),
      );

      // Decoy scaling never resolves — score as a never-resolved attempt
      // via the unresolved terminal override, no synthetic resolvedAtMs
      // fabricated for an ineligible state.
      const decoyState = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: DEPENDENCY_A_INSTANCE_COUNT_KEY, value: 8 },
      ]);
      const decoyScore = scoreAuthoredAttempt(
        MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
        extractScoringInputs(multiServiceMemoryPressureIncidentSimulation, decoyState),
      );

      const baselineState = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
        extractScoringInputs(multiServiceMemoryPressureIncidentSimulation, baselineState),
      );

      const harmfulState = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: WORKER_COUNT_KEY, value: 32 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
        extractScoringInputs(multiServiceMemoryPressureIncidentSimulation, harmfulState),
      );

      const truncationState = runScenario(DEPENDENCY_A_GC_THRASHING_MS + 20_000, [
        { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: MAX_RESPONSE_SIZE_KEY, value: "64kb" },
      ]);
      const truncationScore = scoreAuthoredAttempt(
        MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
        extractScoringInputs(multiServiceMemoryPressureIncidentSimulation, truncationState),
      );

      expect(optimalScore.total).toBe(1000);
      expect(altOptimalScore.total).toBe(1000);
      expect(acceptableScore.total).toBe(830);
      expect(churnScarredScore.total).toBe(765);
      expect(baselineScore.total).toBe(380);
      expect(decoyScore.total).toBe(320);
      expect(harmfulScore.total).toBe(320);
      expect(truncationScore.total).toBe(335);

      // Score sanity audit (section 17):
      // 1. harmful < baseline where harmful is truly worse.
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      // 2. correctness-violating path heavily penalized: dataIntegrity
      // is floored at 0 (strictly worse than the merely-unaddressed
      // baseline's 30), even though truncation's total edges out the
      // unmitigated baseline on other dimensions (cost/reliability) —
      // the correctness dimension itself is unambiguously worse.
      expect(truncationScore.total).toBeLessThan(baselineScore.total);
      expect(truncationScore.breakdown.dataIntegrity).toBe(0);
      expect(truncationScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      // 3. acceptable does not dominate optimal.
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      // 4. zero-action baseline not suspiciously high.
      expect(baselineScore.total).toBeLessThan(500);
      // 5. alternate strategies score according to tradeoffs — the two
      // optimal paths tie because both are equally fast, equally safe,
      // structurally different fixes (a legitimate tie, not a defect).
      expect(optimalScore.total).toBe(altOptimalScore.total);
      // 6. historical damage cannot be improperly erased by a later
      // fix: the churn-scarred recovery scores STRICTLY below both
      // the clean optimal paths AND the acceptable tier, even though
      // its current health (rootCauseHealth=resolved, aggregatorStatus
      // =normal) looks just as clean as optimal.
      expect(churnScarredScore.total).toBeLessThan(optimalScore.total);
      expect(churnScarredScore.total).toBeLessThan(acceptableScore.total);
      expect(churnScarredScore.breakdown.dataIntegrity).toBe(110);
      expect(optimalScore.breakdown.dataIntegrity).toBe(200);

      expect(optimalScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(harmfulScore.total);
    });
  });
});
