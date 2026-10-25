import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { capacityExhaustionDuringPeakEvent } from "./capacity-exhaustion-during-peak-event";
import {
  ADMISSION_CONTROL_KEY,
  API_CONCURRENCY_KEY,
  ASYNC_DEFERRAL_KEY,
  CACHE_STRATEGY_KEY,
  capacityExhaustionDuringPeakEventSimulation,
  DB_CONNECTION_BUDGET_KEY,
  LOAD_SHEDDING_KEY,
  OPTIONAL_FEATURE_DISABLE_KEY,
  REGIONAL_ROUTING_KEY,
  TRAFFIC_CLASS_PRIORITY_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./capacity-exhaustion-during-peak-event/definition";
import { capacityExhaustionDuringPeakEventCandidateUI } from "./capacity-exhaustion-during-peak-event/candidate-ui";
import { CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING } from "./capacity-exhaustion-during-peak-event/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  CACHE_DEGRADED_MS,
  CACHE_WARMUP_FULLY_DONE_MS,
  DB_RECOVERY_FULLY_DONE_MS,
  PEAK_EVENT_ONSET_MS,
  QUEUE_DRAIN_FULLY_DONE_MS,
  RANDOM_SHED_SUSTAINED_MS,
  SUSTAINED_PEAK_MS,
} from "./capacity-exhaustion-during-peak-event/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(capacityExhaustionDuringPeakEventSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += capacityExhaustionDuringPeakEventSimulation.tickMs
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
      capacityExhaustionDuringPeakEventSimulation,
      state,
      action,
      capacityExhaustionDuringPeakEventSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

function buildScoringInputs(state: ReturnType<typeof runScenario>) {
  return {
    incidentStartedAtMs: state.incidentStartedAtMs,
    resolvedAtMs: null,
    failedAtMs: state.failedAtMs,
    totalTimeInCriticalMs: state.customerImpact.totalTimeInCriticalMs,
    totalTimeInDegradedMs: state.customerImpact.totalTimeInDegradedMs,
    revenueLossUsd: state.customerImpact.revenueLossUsd,
    peakSeverityRank: state.peaks.peakSeverityRank,
    numberOfConfigurationChanges: state.numberOfConfigurationChanges,
    numberOfHarmfulChanges: state.numberOfHarmfulChanges,
    numberOfBeneficialChanges: state.numberOfBeneficialChanges,
    initialMonthlyInfrastructureCostUsd:
      capacityExhaustionDuringPeakEventSimulation.infrastructureCost.baselineMonthlyUsd,
    finalMonthlyInfrastructureCostUsd: state.cost.currentMonthlyCostUsd,
    peakMonthlyInfrastructureCostUsd: state.peaks.peakMonthlyCostUsd,
    finalNumericValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>,
    peakNumericValues: state.peaks.peakValues,
    finalStringValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>,
  };
}

// Strategy A: shed-and-protect. Search ends up fully disabled.
const STRATEGY_A_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
  { atMs: SUSTAINED_PEAK_MS + 2_000, controlKey: ADMISSION_CONTROL_KEY, value: "protect-critical" },
  { atMs: SUSTAINED_PEAK_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
  { atMs: SUSTAINED_PEAK_MS + 4_000, controlKey: OPTIONAL_FEATURE_DISABLE_KEY, value: "disabled" },
  { atMs: SUSTAINED_PEAK_MS + 5_000, controlKey: CACHE_STRATEGY_KEY, value: "extended-ttl" },
  { atMs: SUSTAINED_PEAK_MS + 6_000, controlKey: ASYNC_DEFERRAL_KEY, value: "defer-to-queue" },
];

// Strategy B: regional-split-and-degrade. Search stays "degraded", never disabled.
const STRATEGY_B_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: REGIONAL_ROUTING_KEY, value: "split-regional" },
  { atMs: SUSTAINED_PEAK_MS + 2_000, controlKey: CACHE_STRATEGY_KEY, value: "extended-ttl" },
  { atMs: SUSTAINED_PEAK_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
  { atMs: SUSTAINED_PEAK_MS + 4_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
  { atMs: SUSTAINED_PEAK_MS + 5_000, controlKey: ADMISSION_CONTROL_KEY, value: "protect-critical" },
];

describe("Capacity Exhaustion During Peak Event", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal flagship scenario", () => {
      expect(capacityExhaustionDuringPeakEvent.isFree).toBe(false);
      expect(capacityExhaustionDuringPeakEvent.library?.category).toBe("Infrastructure & Capacity");
      expect(capacityExhaustionDuringPeakEvent.library?.tags.length).toBeGreaterThan(0);
      expect(capacityExhaustionDuringPeakEvent.library?.skills.length).toBeGreaterThan(0);
      expect(capacityExhaustionDuringPeakEvent.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(capacityExhaustionDuringPeakEventCandidateUI.metrics.length).toBeGreaterThanOrEqual(10);
      expect(capacityExhaustionDuringPeakEventCandidateUI.controls.length).toBe(10);
      expect(capacityExhaustionDuringPeakEventCandidateUI.components.length).toBe(9);
    });

    it("the architecture has exactly 9 nodes and 11 edges, flat (no nesting)", () => {
      expect(capacityExhaustionDuringPeakEventSimulation.architecture.nodes.length).toBe(9);
      expect(capacityExhaustionDuringPeakEventSimulation.architecture.edges.length).toBe(11);
      for (const node of capacityExhaustionDuringPeakEventSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all six business invariants", () => {
      expect(capacityExhaustionDuringPeakEvent.description).toMatch(/remain available as long as safely possible/i);
      expect(capacityExhaustionDuringPeakEvent.description).toMatch(/may be degraded or disabled/i);
      expect(capacityExhaustionDuringPeakEvent.description).toMatch(/must not be pushed into collapse/i);
      expect(capacityExhaustionDuringPeakEvent.description).toMatch(/accepted async work must remain durable/i);
      expect(capacityExhaustionDuringPeakEvent.description).toMatch(/must be policy-based/i);
      expect(capacityExhaustionDuringPeakEvent.description).toMatch(/demonstrably draining/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of capacityExhaustionDuringPeakEventSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        capacityExhaustionDuringPeakEventSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of capacityExhaustionDuringPeakEventSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(capacityExhaustionDuringPeakEventSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.checkoutSuccessRatePercent).toBe(99.6);
      expect(state.values.cumulativeCriticalTrafficDroppedCount).toBe(0);
    });

    it("peak event onset triggers the incident with legitimate traffic, never a direct checkout drop", () => {
      const state = runScenario(PEAK_EVENT_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(PEAK_EVENT_ONSET_MS);
      expect(state.values.checkoutSuccessRatePercent as number).toBeLessThan(99.6);
      expect(state.values.cumulativeCriticalTrafficDroppedCount).toBe(0);
    });

    it("baseline (no action) shows cache degrading, then DB approaching saturation, over elapsed time", () => {
      const early = runScenario(PEAK_EVENT_ONSET_MS + 5_000);
      const cacheDegraded = runScenario(CACHE_DEGRADED_MS + 5_000);
      const sustained = runScenario(SUSTAINED_PEAK_MS + 5_000);
      expect(early.transitions.incidentState).toBe("baseline-escalating");
      expect(cacheDegraded.transitions.incidentState).toBe("baseline-cache-degraded");
      expect(sustained.transitions.incidentState).toBe("baseline-sustained");
      expect(cacheDegraded.values.cacheHitRatePercent as number).toBeLessThan(
        early.values.cacheHitRatePercent as number,
      );
      expect(sustained.values.dbConnectionUtilizationPercent as number).toBeGreaterThan(
        cacheDegraded.values.dbConnectionUtilizationPercent as number,
      );
      expect(sustained.values.dbSaturationStatus).toBe("critical");
    });
  });

  describe("Required pressure-transfer mechanism #1: apiConcurrency without DB protection", () => {
    it("raising API concurrency alone pushes DB pressure higher than the unaddressed baseline at the same elapsed time", () => {
      const baseline = runScenario(CACHE_DEGRADED_MS + 10_000);
      const escalated = runScenario(CACHE_DEGRADED_MS + 10_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: "high" },
      ]);
      expect(escalated.transitions.incidentState).toBe("capacity-escalation-early");
      expect(escalated.values.dbConnectionUtilizationPercent as number).toBeGreaterThan(
        baseline.values.dbConnectionUtilizationPercent as number,
      );
      expect(escalated.values.dbSaturationStatus).toBe("critical");
    });

    it("sustained, the escalation trap gets strictly worse than baseline", () => {
      const state = runScenario(SUSTAINED_PEAK_MS + 10_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: "high" },
      ]);
      expect(state.transitions.incidentState).toBe("capacity-escalation-trap");
      expect(state.values.dbConnectionUtilizationPercent).toBe(97);
      expect(state.values.dbSaturationStatus).toBe("critical");
    });
  });

  describe("Required pressure-transfer mechanism #2: non-policy-based random shedding", () => {
    it("random-shed creates real, nonzero, non-policy-based critical-traffic drops immediately", () => {
      const state = runScenario(PEAK_EVENT_ONSET_MS + 10_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
      ]);
      expect(state.transitions.incidentState).toBe("random-shed-active");
      expect(state.values.cumulativeCriticalTrafficDroppedCount as number).toBeGreaterThan(0);
      expect(state.values.peakEventStatus).toBe("critical-traffic-dropped");
    });

    it("held through the sustained window, random-shed compounds the historical count further and approaches failure", () => {
      const state = runScenario(RANDOM_SHED_SUSTAINED_MS + 10_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
      ]);
      expect(state.transitions.incidentState).toBe("random-shed-sustained");
      expect(state.values.cumulativeCriticalTrafficDroppedCount).toBe(520);
    });

    it("switching load shedding off stops NEW drops but the peak historical record never decreases", () => {
      const sealedUnsafeState = runScenario(RANDOM_SHED_SUSTAINED_MS + 10_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
      ]);
      const correctedState = runScenario(RANDOM_SHED_SUSTAINED_MS + 20_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
        { atMs: RANDOM_SHED_SUSTAINED_MS + 11_000, controlKey: LOAD_SHEDDING_KEY, value: "off" },
      ]);
      expect(correctedState.values.cumulativeCriticalTrafficDroppedCount).toBe(0);
      expect(correctedState.peaks.peakValues.cumulativeCriticalTrafficDroppedCount as number).toBeGreaterThanOrEqual(
        sealedUnsafeState.values.cumulativeCriticalTrafficDroppedCount as number,
      );
    });

    it("random-shed can never be Finish-eligible, however long it runs", () => {
      const state = runScenario(RANDOM_SHED_SUSTAINED_MS + 60_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
      ]);
      const eligibility = evaluateCompletionEligibility(capacityExhaustionDuringPeakEventSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("eventually reaches automatic failure once enough critical traffic has been dropped", () => {
      // Run long enough for cumulativeCriticalTrafficDroppedCount (520,
      // held for the failureCondition's 45s sustain window) to trip
      // automatic failure.
      const state = runScenario(RANDOM_SHED_SUSTAINED_MS + 120_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
      ]);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
      const finish = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Required pressure-transfer mechanism #3: premature worker-concurrency drain", () => {
    it("raising worker concurrency before the DB has recovered improves backlog but worsens DB pressure", () => {
      const withoutDrain = runScenario(SUSTAINED_PEAK_MS + 10_000);
      const withPrematureDrain = runScenario(SUSTAINED_PEAK_MS + 10_000, [
        { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: "high" },
      ]);
      expect(withPrematureDrain.transitions.incidentState).toBe("premature-worker-drain");
      expect(withPrematureDrain.values.asyncQueueBacklogCount as number).toBeLessThan(
        withoutDrain.values.asyncQueueBacklogCount as number,
      );
      expect(withPrematureDrain.values.dbConnectionUtilizationPercent as number).toBeGreaterThan(
        withoutDrain.values.dbConnectionUtilizationPercent as number,
      );
      expect(withPrematureDrain.values.dbSaturationStatus).toBe("critical");
    });
  });

  describe("Recovery lag: two independent subsystems, neither recovers instantly", () => {
    it("immediately after fixing the DB side, DB utilization has not yet dropped to the recovered value", () => {
      const state = runScenario(SUSTAINED_PEAK_MS + 4_000, [
        { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
        { atMs: SUSTAINED_PEAK_MS + 2_000, controlKey: ADMISSION_CONTROL_KEY, value: "protect-critical" },
        { atMs: SUSTAINED_PEAK_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
      ]);
      expect(state.values.dbConnectionUtilizationPercent).not.toBe(32);
    });

    it("cache warmup and DB recovery progress independently — fixing only the DB side never recovers cache hit rate", () => {
      const dbOnlyActions: TimedAction[] = [
        { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
        { atMs: SUSTAINED_PEAK_MS + 2_000, controlKey: ADMISSION_CONTROL_KEY, value: "protect-critical" },
        { atMs: SUSTAINED_PEAK_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
        { atMs: SUSTAINED_PEAK_MS + 4_000, controlKey: OPTIONAL_FEATURE_DISABLE_KEY, value: "disabled" },
        // Deliberately never engages cacheStrategy=extended-ttl.
      ];
      const state = runScenario(CACHE_WARMUP_FULLY_DONE_MS + 10_000, dbOnlyActions);
      // DB side should be at or near fully recovered (safe-degraded-
      // protected) while cache hit rate never reaches the full
      // strategy-a-optimal warmed value (95) because extended-ttl was
      // never engaged.
      expect(state.values.cacheHitRatePercent).not.toBe(95);
    });

    it("strategy A converges progressively before reaching full optimal — recovery lag is real, never instant", () => {
      const converging = runScenario(SUSTAINED_PEAK_MS + 10_000, STRATEGY_A_ACTIONS);
      const optimal = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_A_ACTIONS);
      expect(converging.transitions.incidentState).toBe("strategy-a-converging");
      expect(optimal.transitions.incidentState).toBe("strategy-a-optimal");
      expect(optimal.values.dbConnectionUtilizationPercent as number).toBeLessThan(
        converging.values.dbConnectionUtilizationPercent as number,
      );
      expect(optimal.values.cacheHitRatePercent as number).toBeGreaterThan(
        converging.values.cacheHitRatePercent as number,
      );
      expect(optimal.values.dbSaturationStatus).toBe("normal");
    });
  });

  describe("Legitimate degraded-but-safe state: safe-degraded-protected", () => {
    it("is immediately reachable (no elapsed-time wait) and keeps checkout protected with zero historical damage", () => {
      const state = runScenario(PEAK_EVENT_ONSET_MS + 40_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
        { atMs: PEAK_EVENT_ONSET_MS + 2_000, controlKey: ADMISSION_CONTROL_KEY, value: "protect-critical" },
        { atMs: PEAK_EVENT_ONSET_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
        { atMs: PEAK_EVENT_ONSET_MS + 4_000, controlKey: OPTIONAL_FEATURE_DISABLE_KEY, value: "disabled" },
      ]);
      expect(state.transitions.incidentState).toBe("safe-degraded-protected");
      expect(state.values.checkoutSuccessRatePercent as number).toBeGreaterThanOrEqual(99.0);
      expect(state.values.dbSaturationStatus).not.toBe("critical");
      expect(state.values.cumulativeCriticalTrafficDroppedCount).toBe(0);
      const eligibility = evaluateCompletionEligibility(capacityExhaustionDuringPeakEventSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("held indefinitely, safe-degraded-protected never produces historical damage", () => {
      const state = runScenario(SUSTAINED_PEAK_MS + 5 * 60_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
        { atMs: PEAK_EVENT_ONSET_MS + 2_000, controlKey: ADMISSION_CONTROL_KEY, value: "protect-critical" },
        { atMs: PEAK_EVENT_ONSET_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
        { atMs: PEAK_EVENT_ONSET_MS + 4_000, controlKey: OPTIONAL_FEATURE_DISABLE_KEY, value: "disabled" },
      ]);
      expect(state.values.cumulativeCriticalTrafficDroppedCount).toBe(0);
    });
  });

  describe("Sequencing sensitivity", () => {
    it("safe sequence: shed -> protect -> bound -> disable -> cache/async reaches strategy-a-optimal", () => {
      const state = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("strategy-a-optimal");
      const eligibility = evaluateCompletionEligibility(capacityExhaustionDuringPeakEventSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("unsafe sequence: draining the worker backlog aggressively BEFORE the DB recovers creates the premature-drain trap instead of helping", () => {
      const unsafeSequenceActions: TimedAction[] = [
        { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
        { atMs: SUSTAINED_PEAK_MS + 2_000, controlKey: ADMISSION_CONTROL_KEY, value: "protect-critical" },
        { atMs: SUSTAINED_PEAK_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
        // Jumps straight to aggressive worker drain instead of waiting.
        { atMs: SUSTAINED_PEAK_MS + 4_000, controlKey: WORKER_CONCURRENCY_KEY, value: "high" },
      ];
      const state = runScenario(SUSTAINED_PEAK_MS + 10_000, unsafeSequenceActions);
      expect(state.transitions.incidentState).toBe("premature-worker-drain");
      expect(state.values.dbSaturationStatus).toBe("critical");
    });
  });

  describe("Alternate strong paths: strategy A and strategy B both reach OPTIMAL independently", () => {
    it("strategy A (shed-and-protect) reaches strategy-a-optimal with search fully disabled", () => {
      const state = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("strategy-a-optimal");
      expect(state.values.searchAvailabilityStatus).toBe("disabled");
      const eligibility = evaluateCompletionEligibility(capacityExhaustionDuringPeakEventSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("strategy B (regional-split-and-degrade) reaches strategy-b-optimal with search left degraded, not disabled", () => {
      const state = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_B_ACTIONS);
      expect(state.transitions.incidentState).toBe("strategy-b-optimal");
      expect(state.values.searchAvailabilityStatus).toBe("degraded");
      const eligibility = evaluateCompletionEligibility(capacityExhaustionDuringPeakEventSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("the two strategies are materially different (not parameter variations): one disables search, the other keeps it degraded", () => {
      const strategyAState = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_A_ACTIONS);
      const strategyBState = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_B_ACTIONS);
      expect(strategyAState.values.searchAvailabilityStatus).not.toBe(
        strategyBState.values.searchAvailabilityStatus,
      );
      expect(strategyAState.controlValues[REGIONAL_ROUTING_KEY]).toBe("primary-only");
      expect(strategyBState.controlValues[REGIONAL_ROUTING_KEY]).toBe("split-regional");
    });
  });

  describe("Partial/isolated lever checks (each control's standalone effect)", () => {
    it("cache strategy alone gives real but partial relief (cache-strategy-only-partial)", () => {
      const state = runScenario(CACHE_DEGRADED_MS + 10_000, [
        { atMs: CACHE_DEGRADED_MS + 1_000, controlKey: CACHE_STRATEGY_KEY, value: "extended-ttl" },
      ]);
      expect(state.transitions.incidentState).toBe("cache-strategy-only");
      expect(state.values.dbSaturationStatus).not.toBe("normal");
    });

    it("DB connection budget alone gives real but partial relief, never fully healthy checkout latency (db-budget-only-partial)", () => {
      const state = runScenario(SUSTAINED_PEAK_MS + 10_000, [
        { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
      ]);
      expect(state.transitions.incidentState).toBe("db-budget-only");
      expect(state.values.dbSaturationStatus).not.toBe("critical");
      expect(state.values.checkoutLatencyMs).toBe(480);
    });

    it("async deferral alone relieves DB connection hold time but leaves cache/admission pressure untouched (async-deferral-only-partial)", () => {
      const withoutDeferral = runScenario(SUSTAINED_PEAK_MS + 10_000);
      const withDeferral = runScenario(SUSTAINED_PEAK_MS + 10_000, [
        { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: ASYNC_DEFERRAL_KEY, value: "defer-to-queue" },
      ]);
      expect(withDeferral.transitions.incidentState).toBe("async-deferral-only");
      expect(withDeferral.values.dbConnectionUtilizationPercent as number).toBeLessThan(
        withoutDeferral.values.dbConnectionUtilizationPercent as number,
      );
      // Async deferral does nothing for cache effectiveness — it never
      // improves cacheHitRatePercent relative to the unaddressed
      // baseline at the same elapsed time, proving the lever's effect
      // is genuinely scoped to DB connection hold time, not a
      // coincidental side effect on every metric.
      expect(withDeferral.values.cacheHitRatePercent as number).toBeLessThanOrEqual(
        withoutDeferral.values.cacheHitRatePercent as number,
      );
    });
  });

  describe("Multi-step path", () => {
    it("step 1 alone (shed optional) gives real but partial relief", () => {
      const state = runScenario(PEAK_EVENT_ONSET_MS + 10_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
      ]);
      expect(state.transitions.incidentState).toBe("shed-optional-only");
      expect(state.values.checkoutSuccessRatePercent as number).toBeGreaterThan(90);
      expect(state.values.dbSaturationStatus).not.toBe("normal");
    });

    it("step 2 on top of step 1 (bound DB budget) still leaves cache unrecovered", () => {
      const state = runScenario(SUSTAINED_PEAK_MS + 10_000, [
        { atMs: SUSTAINED_PEAK_MS + 1_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
      ]);
      expect(state.transitions.incidentState).toBe("db-budget-only");
    });

    it("step 3+ (the full stack) reaches the converging strategy-a state before full elapsed recovery", () => {
      const state = runScenario(SUSTAINED_PEAK_MS + 10_000, STRATEGY_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("strategy-a-converging");
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(PEAK_EVENT_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable (expected default)", () => {
      const state = runScenario(PEAK_EVENT_ONSET_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained escalation still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_PEAK_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(RANDOM_SHED_SUSTAINED_MS + 120_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
      ]);
      const result = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).toBe("failed");
    });
  });

  describe("The tempting unsafe path: maximizing aggregate success rate instead of protecting checkout", () => {
    it("leaving everything admitted keeps globalSuccessRatePercent looking reasonable while checkout keeps degrading relative to a protected path", () => {
      const doNothing = runScenario(SUSTAINED_PEAK_MS + 10_000);
      const protectedState = runScenario(SUSTAINED_PEAK_MS + 10_000, STRATEGY_A_ACTIONS);
      // The naive "keep everything admitted" baseline does NOT beat the
      // protect-critical strategy on checkout, even though its
      // aggregate globalSuccessRatePercent is not catastrophically low.
      expect(protectedState.values.checkoutSuccessRatePercent as number).toBeGreaterThan(
        doNothing.values.checkoutSuccessRatePercent as number,
      );
    });
  });

  describe("Scoring", () => {
    it("optimal path (strategy A) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_A_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, state);
      const inputs = extractFinishScoringInputs(capacityExhaustionDuringPeakEventSimulation, result);
      const score = scoreAuthoredAttempt(CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL (strategy A) SCORE", JSON.stringify(score));
    });

    it("alternate optimal path (strategy B) also scores near-maximum", () => {
      const state = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_B_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, state);
      const inputs = extractFinishScoringInputs(capacityExhaustionDuringPeakEventSimulation, result);
      const score = scoreAuthoredAttempt(CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("ALTERNATE OPTIMAL (strategy B) SCORE", JSON.stringify(score));
    });

    it("acceptable path (safe-degraded-protected) scores well but below optimal", () => {
      const optimalState = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_A_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        extractFinishScoringInputs(capacityExhaustionDuringPeakEventSimulation, optimalResult),
      );

      const acceptableState = runScenario(PEAK_EVENT_ONSET_MS + 60_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: TRAFFIC_CLASS_PRIORITY_KEY, value: "shed-optional" },
        { atMs: PEAK_EVENT_ONSET_MS + 2_000, controlKey: ADMISSION_CONTROL_KEY, value: "protect-critical" },
        { atMs: PEAK_EVENT_ONSET_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "bounded" },
        { atMs: PEAK_EVENT_ONSET_MS + 4_000, controlKey: OPTIONAL_FEATURE_DISABLE_KEY, value: "disabled" },
      ]);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        capacityExhaustionDuringPeakEventSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        extractFinishScoringInputs(capacityExhaustionDuringPeakEventSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery/reliability credit", () => {
      const state = runScenario(SUSTAINED_PEAK_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (random-shed) scores worse than baseline on dataIntegrity AND total, despite reduced total volume", () => {
      const baselineState = runScenario(SUSTAINED_PEAK_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_PEAK_MS + 60_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (random-shed) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("the naive capacity-escalation path (raise apiConcurrency, no protection) scores worse than baseline", () => {
      const baselineState = runScenario(SUSTAINED_PEAK_MS + 60_000);
      const escalationState = runScenario(SUSTAINED_PEAK_MS + 60_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: "high" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        buildScoringInputs(baselineState),
      );
      const escalationScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        buildScoringInputs(escalationState),
      );
      expect(escalationScore.total).toBeLessThan(baselineScore.total);
      console.log("CAPACITY ESCALATION TRAP SCORE", JSON.stringify(escalationScore));
    });

    it("both alternate strong paths reach numerically identical optimal scores when driven to the same real elapsed recovery time", () => {
      const strategyAState = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_A_ACTIONS);
      const strategyBState = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_B_ACTIONS);
      const strategyAResult = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, strategyAState);
      const strategyBResult = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, strategyBState);
      const strategyAScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        extractFinishScoringInputs(capacityExhaustionDuringPeakEventSimulation, strategyAResult),
      );
      const strategyBScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        extractFinishScoringInputs(capacityExhaustionDuringPeakEventSimulation, strategyBResult),
      );
      expect(strategyAScore.total).toBe(strategyBScore.total);
    });
  });

  describe("Score sanity: historical damage cannot be laundered into a near-perfect score", () => {
    it("triggering random-shed briefly then fully recovering to strategy-a-optimal still scores materially worse than a clean optimal run", () => {
      const cleanOptimalState = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, STRATEGY_A_ACTIONS);
      const launderedActions: TimedAction[] = [
        { atMs: PEAK_EVENT_ONSET_MS + 500, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
        { atMs: PEAK_EVENT_ONSET_MS + 5_500, controlKey: LOAD_SHEDDING_KEY, value: "off" },
        ...STRATEGY_A_ACTIONS,
      ];
      const launderedState = runScenario(QUEUE_DRAIN_FULLY_DONE_MS + 35_000, launderedActions);

      // The live final state looks identically optimal on every
      // current-health metric — the whole point of the historical-
      // damage doctrine is that current health alone must not be
      // trusted.
      expect(launderedState.transitions.incidentState).toBe("strategy-a-optimal");
      expect(launderedState.values.cumulativeCriticalTrafficDroppedCount).toBe(0);

      // But the permanent peak record proves real damage occurred
      // earlier in the attempt and was never erased.
      expect(launderedState.peaks.peakValues.cumulativeCriticalTrafficDroppedCount as number).toBeGreaterThan(0);

      const cleanResult = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, cleanOptimalState);
      const launderedResult = evaluateCandidateDeclaredFinish(capacityExhaustionDuringPeakEventSimulation, launderedState);
      const cleanScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        extractFinishScoringInputs(capacityExhaustionDuringPeakEventSimulation, cleanResult),
      );
      const launderedScore = scoreAuthoredAttempt(
        CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
        extractFinishScoringInputs(capacityExhaustionDuringPeakEventSimulation, launderedResult),
      );
      // The historical random-shed episode must still cost real points
      // even once current health is clean — operationalEfficiency
      // penalizes the harmful action itself (numberOfHarmfulChanges),
      // independent of final live state.
      expect(launderedScore.breakdown.operationalEfficiency).toBeLessThan(
        cleanScore.breakdown.operationalEfficiency,
      );
      expect(launderedScore.total).toBeLessThan(cleanScore.total);
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(SUSTAINED_PEAK_MS + 10_000, STRATEGY_A_ACTIONS);
      const runB = runScenario(SUSTAINED_PEAK_MS + 10_000, STRATEGY_A_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak DB connection utilization, async backlog, and critical traffic drop generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_PEAK_MS + 10_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: "high" },
      ]);
      expect(state.peaks.peakValues.dbConnectionUtilizationPercent).toBeGreaterThan(0);
      expect(state.peaks.peakValues.asyncQueueBacklogCount).toBeGreaterThan(0);
    });

    it("tracks peak historical critical-traffic drop count", () => {
      const state = runScenario(PEAK_EVENT_ONSET_MS + 10_000, [
        { atMs: PEAK_EVENT_ONSET_MS + 1_000, controlKey: LOAD_SHEDDING_KEY, value: "random-shed" },
      ]);
      expect(state.peaks.peakValues.cumulativeCriticalTrafficDroppedCount).toBeGreaterThan(0);
    });
  });

  describe("DB recovery lag standalone check", () => {
    it("DB recovery window elapsed trigger genuinely advances dbConnectionUtilizationPercent toward normal over time", () => {
      const partial = runScenario(SUSTAINED_PEAK_MS + 10_000, STRATEGY_A_ACTIONS);
      const fullyRecovered = runScenario(DB_RECOVERY_FULLY_DONE_MS + 10_000, STRATEGY_A_ACTIONS);
      expect(fullyRecovered.values.dbConnectionUtilizationPercent as number).toBeLessThan(
        partial.values.dbConnectionUtilizationPercent as number,
      );
    });
  });
});
