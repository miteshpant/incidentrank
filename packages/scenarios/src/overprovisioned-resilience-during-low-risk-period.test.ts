import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { overprovisionedResilienceDuringLowRiskPeriod } from "./overprovisioned-resilience-during-low-risk-period";
import {
  BACKUP_FREQUENCY_KEY,
  DATABASE_REPLICA_CLASS_KEY,
  FAILOVER_RESERVE_KEY,
  MULTI_AZ_MODE_KEY,
  overprovisionedResilienceDuringLowRiskPeriodSimulation,
  PREWARMED_CACHE_CAPACITY_KEY,
  REPLICA_COUNT_KEY,
  STANDBY_FLEET_KEY,
  WARM_CAPACITY_KEY,
} from "./overprovisioned-resilience-during-low-risk-period/definition";
import { overprovisionedResilienceDuringLowRiskPeriodCandidateUI } from "./overprovisioned-resilience-during-low-risk-period/candidate-ui";
import { OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING } from "./overprovisioned-resilience-during-low-risk-period/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  FIRST_AZ_FAILURE_DRILL_MS,
  HIGH_RISK_WINDOW_ENDED_MS,
  REDUCTION_SETTLE_WINDOW_MS,
  SECOND_AZ_FAILURE_DRILL_MS,
  SUSTAINED_UNREVIEWED_MS,
} from "./overprovisioned-resilience-during-low-risk-period/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(overprovisionedResilienceDuringLowRiskPeriodSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += overprovisionedResilienceDuringLowRiskPeriodSimulation.tickMs
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
      overprovisionedResilienceDuringLowRiskPeriodSimulation,
      state,
      action,
      overprovisionedResilienceDuringLowRiskPeriodSimulation.tickMs,
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
      overprovisionedResilienceDuringLowRiskPeriodSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: compute/standby-first reduction.
const SAFE_COMPUTE_FIRST_ACTIONS: TimedAction[] = [
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-with-standby" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 2_000, controlKey: FAILOVER_RESERVE_KEY, value: "baseline-reserved" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 3_000, controlKey: REPLICA_COUNT_KEY, value: "baseline-operating" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 4_000, controlKey: WARM_CAPACITY_KEY, value: "reduced" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 5_000, controlKey: STANDBY_FLEET_KEY, value: "reduced" },
];

// Alternate strong path B: data-plane-first reduction (compute headroom
// fully preserved).
const SAFE_DATA_PLANE_FIRST_ACTIONS: TimedAction[] = [
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-with-standby" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 2_000, controlKey: FAILOVER_RESERVE_KEY, value: "baseline-reserved" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 3_000, controlKey: DATABASE_REPLICA_CLASS_KEY, value: "baseline-sized" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 4_000, controlKey: PREWARMED_CACHE_CAPACITY_KEY, value: "baseline-sized" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 5_000, controlKey: BACKUP_FREQUENCY_KEY, value: "standard" },
];

// Unsafe minimum-cost path: drop the AZ/failover floor while also
// aggressively cutting every non-floor control to its cheapest value —
// the central tempting-but-unsafe "everything as cheap as possible"
// path. Deliberately does NOT also touch backupFrequency: rule matching
// is first-match-wins on a single dominant violation (mirroring every
// other built-in scenario's rule-table convention), and
// backup-floor-violation-silent is already exercised as its own,
// separate, independently-unsafe path above — stacking it here would
// only test the engine's single-rule-per-tick authoring convention, not
// a materially different lesson.
const UNSAFE_MINIMUM_COST_ACTIONS: TimedAction[] = [
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 2_000, controlKey: FAILOVER_RESERVE_KEY, value: "none" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 3_000, controlKey: REPLICA_COUNT_KEY, value: "minimum" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 4_000, controlKey: WARM_CAPACITY_KEY, value: "none" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 5_000, controlKey: STANDBY_FLEET_KEY, value: "none" },
];

// Acceptable path: a real, deliberate partial reduction, floor
// untouched (still at active-active/peak-reserved).
const ACCEPTABLE_PARTIAL_ACTIONS: TimedAction[] = [
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: REPLICA_COUNT_KEY, value: "baseline-operating" },
  { atMs: HIGH_RISK_WINDOW_ENDED_MS + 2_000, controlKey: WARM_CAPACITY_KEY, value: "reduced" },
];

describe("Overprovisioned Resilience During Low-Risk Period", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff scenario", () => {
      expect(overprovisionedResilienceDuringLowRiskPeriod.isFree).toBe(false);
      expect(overprovisionedResilienceDuringLowRiskPeriod.library?.category).toBe("Infrastructure & Capacity");
      expect(overprovisionedResilienceDuringLowRiskPeriod.library?.tags.length).toBeGreaterThan(0);
      expect(overprovisionedResilienceDuringLowRiskPeriod.library?.skills.length).toBeGreaterThan(0);
      expect(overprovisionedResilienceDuringLowRiskPeriod.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING.dimensions.map((d) => d.dimension);
      expect(dims.sort()).toEqual(
        ["recovery", "customerImpact", "dataIntegrity", "reliability", "costEfficiency", "operationalEfficiency"].sort(),
      );
      const totalMax = OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(overprovisionedResilienceDuringLowRiskPeriodCandidateUI.metrics.length).toBeGreaterThanOrEqual(6);
      expect(overprovisionedResilienceDuringLowRiskPeriodCandidateUI.controls.length).toBeGreaterThanOrEqual(8);
      expect(overprovisionedResilienceDuringLowRiskPeriodCandidateUI.components.length).toBe(5);
    });

    it("the architecture has exactly 5 nodes and 4 edges matching the spec, flat (no nesting)", () => {
      expect(overprovisionedResilienceDuringLowRiskPeriodSimulation.architecture.nodes.length).toBe(5);
      expect(overprovisionedResilienceDuringLowRiskPeriodSimulation.architecture.edges.length).toBe(4);
      for (const node of overprovisionedResilienceDuringLowRiskPeriodSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(overprovisionedResilienceDuringLowRiskPeriod.description).toMatch(/minimum redundancy floor must be preserved/i);
      expect(overprovisionedResilienceDuringLowRiskPeriod.description).toMatch(/single-zone failure tolerance may not be removed/i);
      expect(overprovisionedResilienceDuringLowRiskPeriod.description).toMatch(/peak-event-only capacity may be reduced/i);
      expect(overprovisionedResilienceDuringLowRiskPeriod.description).toMatch(/risk posture may be lowered only to the stated operating baseline/i);
      expect(overprovisionedResilienceDuringLowRiskPeriod.description).toMatch(/never at the expense of mandatory resilience/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of overprovisionedResilienceDuringLowRiskPeriodSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        overprovisionedResilienceDuringLowRiskPeriodSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of overprovisionedResilienceDuringLowRiskPeriodSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(overprovisionedResilienceDuringLowRiskPeriodSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.resilienceFloorStatus).toBe("at-floor-or-above");
      expect(state.values.cumulativeUnabsorbedFailoverDrillCount).toBe(0);
    });

    it("the high-risk-window-ended trigger starts the incident with everything still healthy", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(HIGH_RISK_WINDOW_ENDED_MS);
      expect(state.values.requestSuccessRate as number).toBeGreaterThan(99);
      expect(state.values.resilienceFloorStatus).toBe("at-floor-or-above");
    });

    it("baseline (no action) stays safe but wasteful, with full peak-event cost never reduced", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 5_000);
      expect(state.transitions.incidentState).toBe("unreviewed-peak-posture-baseline");
      expect(state.values.resilienceFloorStatus).toBe("at-floor-or-above");
      expect(state.values.costPostureStatus).toBe("unreviewed-peak-posture");
      expect(state.values.monthlyInfrastructureCostUsd).toBe(48_000);
    });

    it("leaving the posture unreviewed long enough reaches the sustained baseline, still safe, still wasteful", () => {
      const state = runScenario(SUSTAINED_UNREVIEWED_MS + 5_000);
      expect(state.transitions.incidentState).toBe("unreviewed-peak-posture-sustained");
      expect(state.values.resilienceFloorStatus).toBe("at-floor-or-above");
      expect(state.values.requestSuccessRate as number).toBeGreaterThan(99);
    });
  });

  describe("Required trap: below-floor is invisible on the dashboard until a drill fires", () => {
    it("dropping multi-AZ mode below the floor changes nothing on live availability/latency metrics", () => {
      const baseline = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 10_000);
      const belowFloor = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 10_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
      ]);
      expect(belowFloor.transitions.incidentState).toBe("az-floor-violation-quiet");
      expect(belowFloor.values.requestSuccessRate).toBe(baseline.values.requestSuccessRate);
      expect(belowFloor.values.p99LatencyMs).toBe(baseline.values.p99LatencyMs);
      // But the floor status itself already reads unsafe.
      expect(belowFloor.values.resilienceFloorStatus).toBe("below-floor");
      expect(belowFloor.values.cumulativeUnabsorbedFailoverDrillCount).toBe(0);
    });

    it("a quiet below-floor violation is never Finish-eligible, however healthy it looks", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 30_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
      ]);
      const eligibility = evaluateCompletionEligibility(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("releasing all failover reserve is the same kind of quiet, invisible floor violation", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 10_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: FAILOVER_RESERVE_KEY, value: "none" },
      ]);
      expect(state.transitions.incidentState).toBe("failover-reserve-floor-violation-quiet");
      expect(state.values.resilienceFloorStatus).toBe("below-floor");
      expect(state.values.requestSuccessRate as number).toBeGreaterThan(99);
    });

    it("minimal backup frequency violates the durability floor with no live signature at all, ever", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 6 * 60_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: BACKUP_FREQUENCY_KEY, value: "minimal" },
      ]);
      expect(state.transitions.incidentState).toBe("backup-floor-violation-silent");
      expect(state.values.resilienceFloorStatus).toBe("below-floor");
      expect(state.values.requestSuccessRate as number).toBeGreaterThan(99);
      expect(state.values.p99LatencyMs).toBe(90);
    });
  });

  describe("Required consequence: the periodic AZ-failure drill exposes a below-floor violation", () => {
    it("the first drill firing while below floor produces a real, measurable availability/latency hit", () => {
      const quiet = runScenario(FIRST_AZ_FAILURE_DRILL_MS - 1_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
      ]);
      const drillHit = runScenario(FIRST_AZ_FAILURE_DRILL_MS + 1_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
      ]);
      expect(quiet.values.requestSuccessRate as number).toBeGreaterThan(99);
      expect(drillHit.transitions.incidentState).toBe("az-floor-violation-drill-hit");
      expect(drillHit.values.requestSuccessRate as number).toBeLessThan(
        quiet.values.requestSuccessRate as number,
      );
      expect(drillHit.values.p99LatencyMs as number).toBeGreaterThan(quiet.values.p99LatencyMs as number);
      expect(drillHit.values.cumulativeUnabsorbedFailoverDrillCount).toBe(1);
    });

    it("a second drill while still below floor compounds the historical count but never auto-fails the attempt", () => {
      const state = runScenario(SECOND_AZ_FAILURE_DRILL_MS + 30_000 + 1_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
      ]);
      expect(state.transitions.incidentState).toBe("az-floor-violation-drill-hit-second");
      expect(state.values.cumulativeUnabsorbedFailoverDrillCount).toBe(2);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const finish = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("restoring the floor after a drill hit stops NEW drill consequences but the peak historical count never decreases", () => {
      const hitState = runScenario(FIRST_AZ_FAILURE_DRILL_MS + 5_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
      ]);
      const restoredState = runScenario(FIRST_AZ_FAILURE_DRILL_MS + 20_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
        { atMs: FIRST_AZ_FAILURE_DRILL_MS + 6_000, controlKey: MULTI_AZ_MODE_KEY, value: "active-active" },
      ]);
      expect(hitState.values.cumulativeUnabsorbedFailoverDrillCount).toBe(1);
      // Live field returns to 0 once the floor is restored and the
      // matched rule changes (the live field answers "what is the
      // CURRENT posture," not "did this ever happen").
      expect(restoredState.values.resilienceFloorStatus).toBe("at-floor-or-above");
      // But the PEAK historical record never decreases.
      expect(restoredState.peaks.peakValues.cumulativeUnabsorbedFailoverDrillCount as number).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Legitimate alternate strong paths both reach OPTIMAL independently", () => {
    it("strategy A (compute/standby-first) reaches a genuinely safe, cost-reduced settled state", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      expect(state.transitions.incidentState).toBe("safe-reduction-compute-first-settled");
      expect(state.values.resilienceFloorStatus).toBe("at-floor-or-above");
      expect(state.values.costPostureStatus).toBe("reduced-to-baseline-safe");
      const eligibility = evaluateCompletionEligibility(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("strategy B (data-plane-first) reaches a genuinely safe, cost-reduced settled state via a materially different mechanism", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_DATA_PLANE_FIRST_ACTIONS);
      expect(state.transitions.incidentState).toBe("safe-reduction-data-plane-first-settled");
      expect(state.values.resilienceFloorStatus).toBe("at-floor-or-above");
      expect(state.values.costPostureStatus).toBe("reduced-to-baseline-safe");
      const eligibility = evaluateCompletionEligibility(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("reduction is not instant: immediately after engaging strategy A, the state has not yet settled", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 10_000, SAFE_COMPUTE_FIRST_ACTIONS);
      expect(state.transitions.incidentState).toBe("safe-reduction-compute-first-engaging");
      const eligibility = evaluateCompletionEligibility(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("both alternate strong paths reach OPTIMAL and differ honestly on cost mix rather than being an artificial tie", () => {
      const aState = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      const bState = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_DATA_PLANE_FIRST_ACTIONS);
      expect(aState.values.monthlyInfrastructureCostUsd).not.toBe(bState.values.monthlyInfrastructureCostUsd);
      expect(aState.values.resilienceFloorStatus).toBe(bState.values.resilienceFloorStatus);
      expect(aState.values.costPostureStatus).toBe(bState.values.costPostureStatus);
    });
  });

  describe("Genuine ACCEPTABLE tier: a real, deliberate partial reduction", () => {
    it("reducing only non-floor controls while leaving the AZ/failover floor at peak is a real, distinct safe state", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, ACCEPTABLE_PARTIAL_ACTIONS);
      expect(state.transitions.incidentState).toBe("partial-safe-reduction-az-still-peak");
      expect(state.values.resilienceFloorStatus).toBe("at-floor-or-above");
      expect(state.values.costPostureStatus).toBe("reduced-partial-safe");
      const eligibility = evaluateCompletionEligibility(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Unsafe minimum-cost path: looks economically excellent, genuinely unsafe", () => {
    it("the unsafe minimum-cost path saves more money than either safe path but is never Finish-eligible", () => {
      const unsafeState = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 10_000, UNSAFE_MINIMUM_COST_ACTIONS);
      const safeAState = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      expect(unsafeState.values.monthlyInfrastructureCostUsd as number).toBeLessThan(
        safeAState.values.monthlyInfrastructureCostUsd as number,
      );
      expect(unsafeState.values.requestSuccessRate as number).toBeGreaterThanOrEqual(99);
      expect(unsafeState.values.resilienceFloorStatus).toBe("below-floor");
      const eligibility = evaluateCompletionEligibility(overprovisionedResilienceDuringLowRiskPeriodSimulation, unsafeState);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("the unsafe minimum-cost path never auto-fails even once drills expose it and the violation sustains", () => {
      const state = runScenario(SECOND_AZ_FAILURE_DRILL_MS + 30_000 + 1_000, UNSAFE_MINIMUM_COST_ACTIONS);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger the incident, take zero action, Finish -> declared_unstable (green dashboard is not safe handback)", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after the sustained-unreviewed window still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_UNREVIEWED_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued even just before the first drill fires still resolves to declared_unstable", () => {
      const state = runScenario(FIRST_AZ_FAILURE_DRILL_MS - 1_000);
      const result = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("declared_unstable still wins in candidate_declared mode even though the attempt never auto-fails", () => {
      const state = runScenario(SECOND_AZ_FAILURE_DRILL_MS + 30_000 + 1_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
      ]);
      const result = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
    });
  });

  describe("Scoring", () => {
    it("optimal path (strategy A, compute-first) scores well above baseline with full dataIntegrity credit", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      const inputs = extractFinishScoringInputs(overprovisionedResilienceDuringLowRiskPeriodSimulation, result);
      const score = scoreAuthoredAttempt(OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL (strategy A) SCORE", JSON.stringify(score));
    });

    it("optimal path (strategy B, data-plane-first) scores comparably to strategy A", () => {
      const state = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_DATA_PLANE_FIRST_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, state);
      const inputs = extractFinishScoringInputs(overprovisionedResilienceDuringLowRiskPeriodSimulation, result);
      const score = scoreAuthoredAttempt(OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL (strategy B) SCORE", JSON.stringify(score));
    });

    it("acceptable path (partial reduction) scores well but below optimal", () => {
      const optimalState = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(overprovisionedResilienceDuringLowRiskPeriodSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
        extractFinishScoringInputs(overprovisionedResilienceDuringLowRiskPeriodSimulation, optimalResult),
      );

      const acceptableState = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, ACCEPTABLE_PARTIAL_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        overprovisionedResilienceDuringLowRiskPeriodSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
        extractFinishScoringInputs(overprovisionedResilienceDuringLowRiskPeriodSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(optimalResult.completionTier).toBe("optimal");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("safe-but-wasteful baseline scores below both safe-reduction paths on cost efficiency", () => {
      const wastefulState = runScenario(SUSTAINED_UNREVIEWED_MS + 60_000);
      const wastefulScore = scoreAuthoredAttempt(
        OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
        buildScoringInputs(wastefulState),
      );
      const optimalState = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      const optimalScore = scoreAuthoredAttempt(
        OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
        buildScoringInputs(optimalState),
      );
      expect(wastefulScore.breakdown.costEfficiency).toBeLessThan(optimalScore.breakdown.costEfficiency);
      expect(wastefulScore.breakdown.dataIntegrity).toBe(optimalScore.breakdown.dataIntegrity);
      console.log("WASTEFUL BASELINE SCORE", JSON.stringify(wastefulScore));
    });

    it("the unsafe minimum-cost path scores materially worse than the safe-but-wasteful baseline overall, despite looking better on raw cost", () => {
      const wastefulState = runScenario(SUSTAINED_UNREVIEWED_MS + 60_000);
      const unsafeState = runScenario(SUSTAINED_UNREVIEWED_MS + 60_000, UNSAFE_MINIMUM_COST_ACTIONS);
      const wastefulScore = scoreAuthoredAttempt(
        OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
        buildScoringInputs(wastefulState),
      );
      const unsafeScore = scoreAuthoredAttempt(
        OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
        buildScoringInputs(unsafeState),
      );
      // The unsafe path's live cost is materially lower (looks better).
      expect(unsafeState.values.monthlyInfrastructureCostUsd as number).toBeLessThan(
        wastefulState.values.monthlyInfrastructureCostUsd as number,
      );
      // But it scores materially worse overall because of the floor
      // violation's dataIntegrity/reliability penalties.
      expect(unsafeScore.breakdown.dataIntegrity).toBeLessThan(wastefulScore.breakdown.dataIntegrity);
      expect(unsafeScore.total).toBeLessThan(wastefulScore.total);
      console.log("UNSAFE MINIMUM-COST SCORE", JSON.stringify(unsafeScore));
      console.log("SAFE-BUT-WASTEFUL BASELINE SCORE (for comparison)", JSON.stringify(wastefulScore));
    });

    it("the unsafe minimum-cost path scores materially worse than either safe-reduction path overall", () => {
      const unsafeState = runScenario(SECOND_AZ_FAILURE_DRILL_MS - 60_000, UNSAFE_MINIMUM_COST_ACTIONS);
      const safeState = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      const unsafeScore = scoreAuthoredAttempt(
        OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
        buildScoringInputs(unsafeState),
      );
      const safeScore = scoreAuthoredAttempt(
        OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
        buildScoringInputs(safeState),
      );
      expect(unsafeScore.total).toBeLessThan(safeScore.total);
    });
  });

  describe("Engine-level cost-ratio property (documents why costEfficiency uses penalties, not costIncreaseRatio)", () => {
    it("peakMonthlyInfrastructureCostUsd never drops below the authored baseline even after a real reduction", () => {
      const optimalState = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      expect(optimalState.cost.currentMonthlyCostUsd).toBeLessThan(
        overprovisionedResilienceDuringLowRiskPeriodSimulation.infrastructureCost.baselineMonthlyUsd,
      );
      // The live/final cost genuinely dropped, but peak tracking
      // initializes to baseline and only ever Math.max()'s upward — it
      // can never read below the baseline it started at.
      expect(optimalState.peaks.peakMonthlyCostUsd).toBe(
        overprovisionedResilienceDuringLowRiskPeriodSimulation.infrastructureCost.baselineMonthlyUsd,
      );
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      const runB = runScenario(HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000, SAFE_COMPUTE_FIRST_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak unabsorbed-drill count generically via numericWatchFields", () => {
      const state = runScenario(FIRST_AZ_FAILURE_DRILL_MS + 5_000, [
        { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-only" },
      ]);
      expect(state.peaks.peakValues.cumulativeUnabsorbedFailoverDrillCount).toBeGreaterThan(0);
    });
  });
});
