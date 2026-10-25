import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { analyticsWarehouseQueryContention } from "./analytics-warehouse-query-contention";
import {
  AD_HOC_ACCESS_POLICY_KEY,
  AD_HOC_QUERY_CAP_KEY,
  ADMISSION_POLICY_KEY,
  DEADLINE_COMMUNICATION_KEY,
  LONG_RUNNING_QUERY_POLICY_KEY,
  WAREHOUSE_CAPACITY_TIER_KEY,
  analyticsWarehouseQueryContentionSimulation,
} from "./analytics-warehouse-query-contention/definition";
import { analyticsWarehouseQueryContentionCandidateUI } from "./analytics-warehouse-query-contention/candidate-ui";
import { ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING } from "./analytics-warehouse-query-contention/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  CONTENTION_ONSET_MS,
  DRAIN_WINDOW_1_MS,
  DRAIN_WINDOW_FULLY_RECOVERED_MS,
  SUSTAINED_CONTENTION_MS,
} from "./analytics-warehouse-query-contention/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(analyticsWarehouseQueryContentionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += analyticsWarehouseQueryContentionSimulation.tickMs
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
      analyticsWarehouseQueryContentionSimulation,
      state,
      action,
      analyticsWarehouseQueryContentionSimulation.tickMs,
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
      analyticsWarehouseQueryContentionSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: priority-queue admission alone.
const PRIORITY_QUEUE_ONLY_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: ADMISSION_POLICY_KEY, value: "priority-queue" },
];

// Alternate strong path B: ad-hoc cap alone.
const CAPPED_ONLY_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: AD_HOC_QUERY_CAP_KEY, value: "capped" },
];

// Combined strategy: both levers together.
const COMBINED_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: ADMISSION_POLICY_KEY, value: "priority-queue" },
  { atMs: SUSTAINED_CONTENTION_MS + 2_000, controlKey: AD_HOC_QUERY_CAP_KEY, value: "capped" },
];

describe("Analytics Warehouse Query Contention", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(analyticsWarehouseQueryContention.isFree).toBe(false);
      expect(analyticsWarehouseQueryContention.library?.category).toBe("Data Pipelines");
      expect(analyticsWarehouseQueryContention.library?.tags.length).toBeGreaterThan(0);
      expect(analyticsWarehouseQueryContention.library?.skills.length).toBeGreaterThan(0);
      expect(analyticsWarehouseQueryContention.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(analyticsWarehouseQueryContentionCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(analyticsWarehouseQueryContentionCandidateUI.controls.length).toBeGreaterThanOrEqual(6);
      expect(analyticsWarehouseQueryContentionCandidateUI.components.length).toBe(5);
    });

    it("the architecture is a flat 5-node, 4-edge fan-in matching the spec", () => {
      expect(analyticsWarehouseQueryContentionSimulation.architecture.nodes.length).toBe(5);
      expect(analyticsWarehouseQueryContentionSimulation.architecture.edges.length).toBe(4);
      for (const node of analyticsWarehouseQueryContentionSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all four business invariants", () => {
      expect(analyticsWarehouseQueryContention.description).toMatch(
        /critical scheduled-report jobs with real deadlines must complete within their sla/i,
      );
      expect(analyticsWarehouseQueryContention.description).toMatch(
        /must not be revoked entirely/i,
      );
      expect(analyticsWarehouseQueryContention.description).toMatch(
        /real lost-work cost that must be weighed/i,
      );
      expect(analyticsWarehouseQueryContention.description).toMatch(
        /warehouse capacity alone is not the primary fix/i,
      );
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of analyticsWarehouseQueryContentionSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        analyticsWarehouseQueryContentionSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of analyticsWarehouseQueryContentionSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(analyticsWarehouseQueryContentionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.reportOnTrackForSla).toBe(1);
      expect(state.values.adHocAccessAvailabilityPercent).toBe(100);
      expect(state.values.dataScienceLostWorkHoursCumulative).toBe(0);
    });

    it("contention onset triggers the incident", () => {
      const state = runScenario(CONTENTION_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(CONTENTION_ONSET_MS);
      expect(state.transitions.incidentState).toBe("baseline-contention");
    });

    it("baseline (no action) breaches the SLA once contention is sustained", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-sustained-contention");
      expect(state.values.reportOnTrackForSla).toBe(0);
      expect(state.values.slaStatus).toBe("breached");
      expect(state.values.workloadTradeoffStatus).toBe("sla-exposed");
    });
  });

  describe("Required overcorrection trap: revoking ad-hoc access entirely", () => {
    it("revoking access guarantees the SLA but is flagged as a business-invariant violation", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: AD_HOC_ACCESS_POLICY_KEY, value: "revoked" },
      ]);
      expect(state.transitions.incidentState).toBe("adhoc-access-revoked-overcorrection");
      expect(state.values.reportOnTrackForSla).toBe(1);
      expect(state.values.adHocAccessAvailabilityPercent).toBe(0);
      expect(state.values.workloadTradeoffStatus).toBe("overcorrected");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("revoked access never reaches Finish-eligibility however long it runs", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 10 * 60_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: AD_HOC_ACCESS_POLICY_KEY, value: "revoked" },
      ]);
      const finish = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Required hard-kill trap: destroying Data Science work with no warning", () => {
    it("hard-kill looks like it protects the SLA, but accrues real, permanent lost-work cost", () => {
      const baseline = runScenario(SUSTAINED_CONTENTION_MS + 5_000);
      const hardKillState = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: LONG_RUNNING_QUERY_POLICY_KEY, value: "hard-kill" },
      ]);
      expect(hardKillState.transitions.incidentState).toBe("hard-kill-lost-work-trap");
      expect(hardKillState.values.reportOnTrackForSla).toBe(1);
      expect(hardKillState.values.dataScienceLostWorkHoursCumulative as number).toBeGreaterThan(0);
      // Its SLA looks just as good as baseline's at-risk-but-not-yet-
      // breached active window would — the lost work is the ONLY
      // signal this is unsafe.
      expect(hardKillState.values.workloadTradeoffStatus).toBe("balanced");
      expect(baseline.values.workloadTradeoffStatus).toBe("sla-exposed");
    });

    it("hard-kill is independent of the overcorrection trap (reachable with ad-hoc access left open)", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: AD_HOC_ACCESS_POLICY_KEY, value: "open" },
        { atMs: CONTENTION_ONSET_MS + 2_000, controlKey: LONG_RUNNING_QUERY_POLICY_KEY, value: "hard-kill" },
      ]);
      expect(state.transitions.incidentState).toBe("hard-kill-lost-work-trap");
      expect(state.values.dataScienceLostWorkHoursCumulative as number).toBeGreaterThan(0);
    });

    it("reverting hard-kill to allow stops NEW losses but the peak historical record never decreases", () => {
      const sealed = runScenario(SUSTAINED_CONTENTION_MS + 10_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: LONG_RUNNING_QUERY_POLICY_KEY, value: "hard-kill" },
      ]);
      const corrected = runScenario(SUSTAINED_CONTENTION_MS + 20_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: LONG_RUNNING_QUERY_POLICY_KEY, value: "hard-kill" },
        { atMs: SUSTAINED_CONTENTION_MS + 11_000, controlKey: LONG_RUNNING_QUERY_POLICY_KEY, value: "allow" },
      ]);
      expect(sealed.values.dataScienceLostWorkHoursCumulative as number).toBeGreaterThan(0);
      expect(corrected.peaks.peakValues.dataScienceLostWorkHoursCumulative as number).toBeGreaterThanOrEqual(
        sealed.values.dataScienceLostWorkHoursCumulative as number,
      );
      // Live field reverts once allow is restored (the hard-kill rule no
      // longer matches), but the peak never resets.
      expect(corrected.values.dataScienceLostWorkHoursCumulative).toBe(0);
      expect(corrected.peaks.peakValues.dataScienceLostWorkHoursCumulative as number).toBeGreaterThan(0);
    });
  });

  describe("Alternate strong path A: priority-queue admission alone", () => {
    it("protects the SLA immediately (just-engaged, before the drain window)", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 35_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("priority-queue-draining");
      expect(state.values.reportOnTrackForSla).toBe(1);
      expect(state.values.adHocAccessAvailabilityPercent).toBe(100);
      expect(state.values.workloadTradeoffStatus).toBe("balanced");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("reaches genuine OPTIMAL once the full drain window elapses", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("priority-queue-fully-recovered");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });
  });

  describe("Alternate strong path B: ad-hoc cap alone (materially different mechanism)", () => {
    it("protects the SLA immediately via bounding concurrency rather than reordering", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 35_000, CAPPED_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("capped-draining");
      expect(state.values.reportOnTrackForSla).toBe(1);
      expect(state.values.adHocAccessAvailabilityPercent).toBe(100);
      expect(state.values.workloadTradeoffStatus).toBe("balanced");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("reaches genuine OPTIMAL once the full drain window elapses", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, CAPPED_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("capped-fully-recovered");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("is a distinct mechanism from priority-queue: queued-query volumes differ at the same elapsed time", () => {
      const prioritized = runScenario(SUSTAINED_CONTENTION_MS + 4_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      const capped = runScenario(SUSTAINED_CONTENTION_MS + 4_000, CAPPED_ONLY_ACTIONS);
      // priority-queue reorders admission among a still-large ad-hoc
      // pool; capped directly shrinks how many ad-hoc queries may run
      // concurrently at all — different admitted-query counts prove
      // these are not the same mechanism relabeled.
      expect(prioritized.values.adHocConcurrentQueries).not.toBe(capped.values.adHocConcurrentQueries);
    });
  });

  describe("Combined strategy recovers fastest", () => {
    it("combining priority-queue and capped reaches the combined-specific state, not either individual path", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000, COMBINED_ACTIONS);
      expect(state.transitions.incidentState).toBe("combined-prioritized-capped-draining");
    });

    it("reaches genuine OPTIMAL once the full drain window elapses", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, COMBINED_ACTIONS);
      expect(state.transitions.incidentState).toBe("combined-prioritized-capped-fully-recovered");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Pure scale-up is recognizably insufficient (central-judgment proof)", () => {
    it("scaling the warehouse alone does not protect the SLA under sustained contention", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: WAREHOUSE_CAPACITY_TIER_KEY, value: "scaled" },
      ]);
      expect(state.transitions.incidentState).toBe("capacity-scaled-insufficient-sustained");
      expect(state.values.reportOnTrackForSla).toBe(0);
      expect(state.values.slaStatus).toBe("breached");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("scaling genuinely raises throughput (lower utilization/latency than unscaled baseline) without fixing the SLA", () => {
      const unscaled = runScenario(SUSTAINED_CONTENTION_MS + 5_000);
      const scaled = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: WAREHOUSE_CAPACITY_TIER_KEY, value: "scaled" },
      ]);
      expect(scaled.values.warehouseUtilizationPercent as number).toBeLessThan(
        unscaled.values.warehouseUtilizationPercent as number,
      );
      expect(scaled.values.queryLatencyP95Seconds as number).toBeLessThan(
        unscaled.values.queryLatencyP95Seconds as number,
      );
      // Yet neither protects the SLA.
      expect(scaled.values.reportOnTrackForSla).toBe(0);
      expect(unscaled.values.reportOnTrackForSla).toBe(0);
    });

    it("scaling is not a dead control: combining it with priority-queue still reaches the priority-queue path, never a distinct capacity-branch regression", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: WAREHOUSE_CAPACITY_TIER_KEY, value: "scaled" },
        ...PRIORITY_QUEUE_ONLY_ACTIONS,
      ]);
      // Capacity-scaled rules require admissionPolicy="fifo" explicitly
      // — once priority-queue is engaged, the more general
      // priority-queue-draining rule matches instead, proving capacity
      // genuinely interacts with (does not override) prioritization.
      expect(state.transitions.incidentState).toBe("priority-queue-draining");
      expect(state.cost.currentMonthlyCostUsd).toBeGreaterThan(
        analyticsWarehouseQueryContentionSimulation.infrastructureCost.baselineMonthlyUsd,
      );
    });
  });

  describe("Legitimate degraded-but-safe state: graceful-stop alone", () => {
    it("bounds Data Science lost-work cost without hard-kill's total loss, reaching ACCEPTABLE", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 35_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: LONG_RUNNING_QUERY_POLICY_KEY, value: "graceful-stop" },
      ]);
      expect(state.transitions.incidentState).toBe("graceful-stop-bounded-loss");
      expect(state.values.dataScienceLostWorkHoursCumulative).toBe(1);
      const hardKillState = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: LONG_RUNNING_QUERY_POLICY_KEY, value: "hard-kill" },
      ]);
      expect(state.values.dataScienceLostWorkHoursCumulative as number).toBeLessThan(
        hardKillState.values.dataScienceLostWorkHoursCumulative as number,
      );
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Communication is not a dead control", () => {
    it("proactive-notice reaches a distinct state and real cost from silent, without changing the SLA outcome", () => {
      const silent = runScenario(SUSTAINED_CONTENTION_MS + 5_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      const proactive = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
        ...PRIORITY_QUEUE_ONLY_ACTIONS,
        { atMs: SUSTAINED_CONTENTION_MS + 3_000, controlKey: DEADLINE_COMMUNICATION_KEY, value: "proactive-notice" },
      ]);
      expect(silent.transitions.incidentState).toBe("priority-queue-draining");
      expect(proactive.transitions.incidentState).toBe("priority-queue-draining-proactive");
      expect(silent.values.reportOnTrackForSla).toBe(proactive.values.reportOnTrackForSla);
      expect(proactive.cost.currentMonthlyCostUsd).toBeGreaterThan(silent.cost.currentMonthlyCostUsd);
    });

    it("silent communication is penalized on operationalEfficiency relative to proactive-notice", () => {
      const silentState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      const proactiveState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        ...PRIORITY_QUEUE_ONLY_ACTIONS,
        { atMs: SUSTAINED_CONTENTION_MS + 3_000, controlKey: DEADLINE_COMMUNICATION_KEY, value: "proactive-notice" },
      ]);
      const silentResult = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, silentState);
      const proactiveResult = evaluateCandidateDeclaredFinish(
        analyticsWarehouseQueryContentionSimulation,
        proactiveState,
      );
      const silentScore = scoreAuthoredAttempt(
        ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
        extractFinishScoringInputs(analyticsWarehouseQueryContentionSimulation, silentResult),
      );
      const proactiveScore = scoreAuthoredAttempt(
        ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
        extractFinishScoringInputs(analyticsWarehouseQueryContentionSimulation, proactiveResult),
      );
      expect(proactiveScore.breakdown.operationalEfficiency).toBeGreaterThan(
        silentScore.breakdown.operationalEfficiency,
      );
    });
  });

  describe("No scale-X-overload-Y mechanic", () => {
    it("scaling the warehouse never degrades any other component's health", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: WAREHOUSE_CAPACITY_TIER_KEY, value: "scaled" },
        ...COMBINED_ACTIONS,
      ]);
      expect(state.componentHealth["bi-users"]).toBe("healthy");
      expect(state.componentHealth["data-science"]).toBe("healthy");
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable", () => {
      const state = runScenario(CONTENTION_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable", () => {
      const state = runScenario(CONTENTION_ONSET_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained contention still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (combined) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, COMBINED_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, state);
      const inputs = extractFinishScoringInputs(analyticsWarehouseQueryContentionSimulation, result);
      const score = scoreAuthoredAttempt(ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL (combined) SCORE", JSON.stringify(score));
    });

    it("alternate-optimal path (priority-queue alone) scores with full dataIntegrity credit too", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, state);
      expect(result.completionTier).toBe("optimal");
      const inputs = extractFinishScoringInputs(analyticsWarehouseQueryContentionSimulation, result);
      const score = scoreAuthoredAttempt(ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL (priority-queue alone) SCORE", JSON.stringify(score));
    });

    it("acceptable path (still draining) scores well but below optimal", () => {
      const optimalState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
        extractFinishScoringInputs(analyticsWarehouseQueryContentionSimulation, optimalResult),
      );

      const acceptableState = runScenario(DRAIN_WINDOW_1_MS + 5_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        analyticsWarehouseQueryContentionSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
        extractFinishScoringInputs(analyticsWarehouseQueryContentionSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE (priority-queue-draining) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (overcorrection) scores worse than baseline on dataIntegrity AND total, despite SLA looking perfect", () => {
      const baselineState = runScenario(SUSTAINED_CONTENTION_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_CONTENTION_MS + 60_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: AD_HOC_ACCESS_POLICY_KEY, value: "revoked" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.reportOnTrackForSla).toBe(1);
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (overcorrection) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("unsafe-minimum-cost (overcorrection, zero extra spend) cannot win overall against the safe-but-costlier scaled+prioritized path", () => {
      const unsafeMinCostState = runScenario(SUSTAINED_CONTENTION_MS + 60_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: AD_HOC_ACCESS_POLICY_KEY, value: "revoked" },
      ]);
      const safeButCostlierState = runScenario(SUSTAINED_CONTENTION_MS + 60_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: WAREHOUSE_CAPACITY_TIER_KEY, value: "scaled" },
        ...PRIORITY_QUEUE_ONLY_ACTIONS,
      ]);
      const unsafeScore = scoreAuthoredAttempt(
        ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
        buildScoringInputs(unsafeMinCostState),
      );
      const safeScore = scoreAuthoredAttempt(
        ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
        buildScoringInputs(safeButCostlierState),
      );
      expect(unsafeMinCostState.cost.currentMonthlyCostUsd).toBeLessThan(
        safeButCostlierState.cost.currentMonthlyCostUsd,
      );
      expect(unsafeScore.total).toBeLessThan(safeScore.total);
      console.log("UNSAFE MINIMUM-COST SCORE", JSON.stringify(unsafeScore));
      console.log("SAFE-BUT-COSTLIER SCORE (for comparison)", JSON.stringify(safeScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(DRAIN_WINDOW_1_MS + 5_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      const runB = runScenario(DRAIN_WINDOW_1_MS + 5_000, PRIORITY_QUEUE_ONLY_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak lost-work hours and queue wait generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 10_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: LONG_RUNNING_QUERY_POLICY_KEY, value: "hard-kill" },
      ]);
      expect(state.peaks.peakValues.dataScienceLostWorkHoursCumulative).toBeGreaterThan(0);
      expect(state.peaks.peakValues.reportQueueWaitMinutes).toBeGreaterThanOrEqual(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // DEFAULT-VALUE PATH COMPLETENESS — the exact defect class phase6e3.md
  // requires auditing. For every legitimate safe strategy, run it with
  // every control the strategy's own description does NOT require
  // touching left at its untouched default, run well past every
  // elapsed-time threshold, and confirm a genuinely safe terminal state
  // (never a fallthrough to baseline/unsafe).
  // ══════════════════════════════════════════════════════════════════
  describe("Default-value path completeness", () => {
    it("REGRESSION: priority-queue alone (cap/kill/access/capacity/communication all left at default) reaches OPTIMAL at the fully-recovered window, never falling through to baseline", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: ADMISSION_POLICY_KEY, value: "priority-queue" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-contention");
      expect(state.transitions.incidentState).toBe("priority-queue-fully-recovered");
      expect(state.values.reportOnTrackForSla).toBe(1);
      expect(state.values.adHocAccessAvailabilityPercent).toBe(100);
      expect(state.values.workloadTradeoffStatus).toBe("balanced");
      expect(state.values.slaStatus).toBe("on-track");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(analyticsWarehouseQueryContentionSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("REGRESSION: ad-hoc cap alone (admission/kill/access/capacity/communication all left at default) reaches OPTIMAL at the fully-recovered window, never falling through to baseline", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: AD_HOC_QUERY_CAP_KEY, value: "capped" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-contention");
      expect(state.transitions.incidentState).toBe("capped-fully-recovered");
      expect(state.values.reportOnTrackForSla).toBe(1);
      expect(state.values.adHocAccessAvailabilityPercent).toBe(100);
      expect(state.values.workloadTradeoffStatus).toBe("balanced");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: priority-queue alone at the DRAINING tier (not yet fully recovered, every other control default) reaches a genuinely safe ACCEPTABLE state, never baseline", () => {
      const state = runScenario(DRAIN_WINDOW_1_MS + 5_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: ADMISSION_POLICY_KEY, value: "priority-queue" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-contention");
      expect(state.transitions.incidentState).toBe("priority-queue-draining");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("REGRESSION: ad-hoc cap alone at the DRAINING tier (not yet fully recovered, every other control default) reaches a genuinely safe ACCEPTABLE state, never baseline", () => {
      const state = runScenario(DRAIN_WINDOW_1_MS + 5_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: AD_HOC_QUERY_CAP_KEY, value: "capped" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-contention");
      expect(state.transitions.incidentState).toBe("capped-draining");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("REGRESSION: combined priority-queue+capped, with kill/access/capacity/communication all left at default, reaches OPTIMAL at the fully-recovered window", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: ADMISSION_POLICY_KEY, value: "priority-queue" },
        { atMs: SUSTAINED_CONTENTION_MS + 2_000, controlKey: AD_HOC_QUERY_CAP_KEY, value: "capped" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-contention");
      expect(state.transitions.incidentState).toBe("combined-prioritized-capped-fully-recovered");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: graceful-stop alone (admission/cap/access/capacity/communication all left at default) reaches a genuinely safe ACCEPTABLE state at the sustained-contention tier, never baseline", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 35_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: LONG_RUNNING_QUERY_POLICY_KEY, value: "graceful-stop" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-contention");
      expect(state.transitions.incidentState).toBe("graceful-stop-bounded-loss");
      expect(state.values.reportOnTrackForSla).toBe(1);
      expect(state.values.workloadTradeoffStatus).toBe("balanced");
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("REGRESSION: priority-queue alone also holds at the JUST-ENGAGED tier (before sustainedContention), every other control default", () => {
      const state = runScenario(CONTENTION_ONSET_MS + 40_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: ADMISSION_POLICY_KEY, value: "priority-queue" },
      ]);
      expect(state.transitions.incidentState).toBe("priority-queue-just-engaged");
      expect(state.values.reportOnTrackForSla).toBe(1);
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("REGRESSION: ad-hoc cap alone also holds at the JUST-ENGAGED tier (before sustainedContention), every other control default", () => {
      const state = runScenario(CONTENTION_ONSET_MS + 40_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: AD_HOC_QUERY_CAP_KEY, value: "capped" },
      ]);
      expect(state.transitions.incidentState).toBe("capped-just-engaged");
      expect(state.values.reportOnTrackForSla).toBe(1);
      const eligibility = evaluateCompletionEligibility(analyticsWarehouseQueryContentionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });
});
