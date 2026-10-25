import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { emergencyCapacityReservationDecision } from "./emergency-capacity-reservation-decision";
import {
  CONTINGENCY_RESERVE_KEY,
  emergencyCapacityReservationDecisionSimulation,
  FORECAST_CONFIDENCE_THRESHOLD_KEY,
  ON_DEMAND_FALLBACK_POLICY_KEY,
  OPTIONAL_WORKLOAD_SHEDDING_KEY,
  RESERVATION_TIMING_KEY,
  RESERVED_CAPACITY_REGION_A_KEY,
  RESERVED_CAPACITY_REGION_B_KEY,
  RESERVED_CAPACITY_REGION_C_KEY,
} from "./emergency-capacity-reservation-decision/definition";
import { emergencyCapacityReservationDecisionCandidateUI } from "./emergency-capacity-reservation-decision/candidate-ui";
import { EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING } from "./emergency-capacity-reservation-decision/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  DECISION_WINDOW_OPENED_MS,
  EVENT_ARRIVAL_MS,
  EVENT_SUSTAINED_MS,
  REGIONAL_DISRUPTION_MS,
  RESERVATION_DEADLINE_MS,
} from "./emergency-capacity-reservation-decision/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(emergencyCapacityReservationDecisionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += emergencyCapacityReservationDecisionSimulation.tickMs
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
      emergencyCapacityReservationDecisionSimulation,
      state,
      action,
      emergencyCapacityReservationDecisionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

// ── Named reservation strategies (exact region triples, see rules.ts) ──
const HIGH_ACTIONS: TimedAction[] = [
  { atMs: DECISION_WINDOW_OPENED_MS + 1_000, controlKey: RESERVED_CAPACITY_REGION_A_KEY, value: 900 },
  { atMs: DECISION_WINDOW_OPENED_MS + 2_000, controlKey: RESERVED_CAPACITY_REGION_B_KEY, value: 900 },
  { atMs: DECISION_WINDOW_OPENED_MS + 3_000, controlKey: RESERVED_CAPACITY_REGION_C_KEY, value: 900 },
  { atMs: DECISION_WINDOW_OPENED_MS + 4_000, controlKey: RESERVATION_TIMING_KEY, value: "lock-in-now" },
];

const MID_ACTIONS: TimedAction[] = [
  { atMs: DECISION_WINDOW_OPENED_MS + 1_000, controlKey: RESERVED_CAPACITY_REGION_A_KEY, value: 600 },
  { atMs: DECISION_WINDOW_OPENED_MS + 2_000, controlKey: RESERVED_CAPACITY_REGION_B_KEY, value: 600 },
  { atMs: DECISION_WINDOW_OPENED_MS + 3_000, controlKey: RESERVED_CAPACITY_REGION_C_KEY, value: 600 },
  { atMs: DECISION_WINDOW_OPENED_MS + 4_000, controlKey: RESERVATION_TIMING_KEY, value: "lock-in-now" },
];

const MID_FALLBACK_SHEDDING_ACTIONS: TimedAction[] = [
  ...MID_ACTIONS,
  { atMs: DECISION_WINDOW_OPENED_MS + 5_000, controlKey: ON_DEMAND_FALLBACK_POLICY_KEY, value: "enabled" },
  { atMs: DECISION_WINDOW_OPENED_MS + 6_000, controlKey: OPTIONAL_WORKLOAD_SHEDDING_KEY, value: "shed-under-pressure" },
];

const MID_FALLBACK_ONLY_ACTIONS: TimedAction[] = [
  ...MID_ACTIONS,
  { atMs: DECISION_WINDOW_OPENED_MS + 5_000, controlKey: ON_DEMAND_FALLBACK_POLICY_KEY, value: "enabled" },
];

const MIN_ACTIONS: TimedAction[] = [
  { atMs: DECISION_WINDOW_OPENED_MS + 1_000, controlKey: RESERVED_CAPACITY_REGION_A_KEY, value: 300 },
  { atMs: DECISION_WINDOW_OPENED_MS + 2_000, controlKey: RESERVED_CAPACITY_REGION_B_KEY, value: 300 },
  { atMs: DECISION_WINDOW_OPENED_MS + 3_000, controlKey: RESERVED_CAPACITY_REGION_C_KEY, value: 300 },
  { atMs: DECISION_WINDOW_OPENED_MS + 4_000, controlKey: RESERVATION_TIMING_KEY, value: "lock-in-now" },
];

const CONC_ACTIONS: TimedAction[] = [
  { atMs: DECISION_WINDOW_OPENED_MS + 1_000, controlKey: RESERVED_CAPACITY_REGION_A_KEY, value: 900 },
  { atMs: DECISION_WINDOW_OPENED_MS + 2_000, controlKey: RESERVED_CAPACITY_REGION_B_KEY, value: 300 },
  { atMs: DECISION_WINDOW_OPENED_MS + 3_000, controlKey: RESERVED_CAPACITY_REGION_C_KEY, value: 300 },
  { atMs: DECISION_WINDOW_OPENED_MS + 4_000, controlKey: RESERVATION_TIMING_KEY, value: "lock-in-now" },
];

const THIN_ACTIONS: TimedAction[] = [
  { atMs: DECISION_WINDOW_OPENED_MS + 1_000, controlKey: RESERVED_CAPACITY_REGION_A_KEY, value: 300 },
  { atMs: DECISION_WINDOW_OPENED_MS + 2_000, controlKey: RESERVED_CAPACITY_REGION_B_KEY, value: 300 },
  { atMs: DECISION_WINDOW_OPENED_MS + 3_000, controlKey: RESERVED_CAPACITY_REGION_C_KEY, value: 600 },
  { atMs: DECISION_WINDOW_OPENED_MS + 4_000, controlKey: RESERVATION_TIMING_KEY, value: "lock-in-now" },
];

const THIN_FALLBACK_ACTIONS: TimedAction[] = [
  ...THIN_ACTIONS,
  { atMs: DECISION_WINDOW_OPENED_MS + 5_000, controlKey: ON_DEMAND_FALLBACK_POLICY_KEY, value: "enabled" },
];

const WASTE_ACTIONS: TimedAction[] = [
  ...HIGH_ACTIONS,
  { atMs: DECISION_WINDOW_OPENED_MS + 5_000, controlKey: CONTINGENCY_RESERVE_KEY, value: "large" },
];

describe("Emergency Capacity Reservation Decision", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(emergencyCapacityReservationDecision.isFree).toBe(false);
      expect(emergencyCapacityReservationDecision.library?.category).toBe("Infrastructure & Capacity");
      expect(emergencyCapacityReservationDecision.library?.tags.length).toBeGreaterThan(0);
      expect(emergencyCapacityReservationDecision.library?.skills.length).toBeGreaterThan(0);
      expect(emergencyCapacityReservationDecision.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING.dimensions.map((d) => d.dimension);
      expect(dims.sort()).toEqual(
        ["recovery", "customerImpact", "dataIntegrity", "reliability", "costEfficiency", "operationalEfficiency"].sort(),
      );
      const totalMax = EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(emergencyCapacityReservationDecisionCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(emergencyCapacityReservationDecisionCandidateUI.controls.length).toBeGreaterThanOrEqual(7);
      expect(emergencyCapacityReservationDecisionCandidateUI.components.length).toBe(7);
    });

    it("the architecture is a flat 7-node, 8-edge fan-out matching the spec", () => {
      expect(emergencyCapacityReservationDecisionSimulation.architecture.nodes.length).toBe(7);
      expect(emergencyCapacityReservationDecisionSimulation.architecture.edges.length).toBe(8);
      for (const node of emergencyCapacityReservationDecisionSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
      }
    });

    it("the briefing explicitly states all five business invariants", () => {
      const d = emergencyCapacityReservationDecision.description;
      expect(d).toMatch(/Critical-Tier workload must have enough protected capacity/i);
      expect(d).toMatch(/Optional-Tier workload may use on-demand capacity or be degraded/i);
      expect(d).toMatch(/every reservation has real, non-refundable cost/i);
      expect(d).toMatch(/reserved capacity must stay distributed across regions/i);
      expect(d).toMatch(/forecast's own stated uncertainty must be treated explicitly/i);
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of emergencyCapacityReservationDecisionSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it (zero dead controls)", () => {
      const classifiedKeys = new Set(emergencyCapacityReservationDecisionSimulation.actionClassifications.map((r) => r.controlKey));
      for (const control of emergencyCapacityReservationDecisionSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });

    it("every control is referenced by at least one rule condition (zero dead controls)", () => {
      const ruleControlKeys = new Set<string>();
      for (const rule of emergencyCapacityReservationDecisionSimulation.rules) {
        for (const key of Object.keys(rule.when.controlEquals ?? {})) {
          ruleControlKeys.add(key);
        }
      }
      for (const control of emergencyCapacityReservationDecisionSimulation.controls) {
        expect(ruleControlKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime: proactive, no-outage start", () => {
    it("starts healthy with authored initial values and no live exposure", () => {
      const state = createInitialState(emergencyCapacityReservationDecisionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("not-yet-exposed");
      expect(state.values.reservedCapacityTotalUnits).toBe(0);
    });

    it("decision window opens with zero live exposure regardless of elapsed time, until the event arrives", () => {
      const state = runScenario(RESERVATION_DEADLINE_MS - 5_000);
      expect(state.values.criticalWorkloadProtectionStatus).toBe("not-yet-exposed");
      expect(state.customerImpact.revenueLossUsd).toBe(0);
    });

    it("Immediate-Finish audit: triggering the decision window and calling Finish with zero actions returns declared_unstable", () => {
      const state = runScenario(DECISION_WINDOW_OPENED_MS + 2_000);
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
      expect(finish.completionTier).toBeNull();
    });

    it("a green system before the event arrives never equals a safe handback (eligibility false throughout the decision window)", () => {
      const state = runScenario(RESERVATION_DEADLINE_MS - 10_000, HIGH_ACTIONS);
      const eligibility = evaluateCompletionEligibility(emergencyCapacityReservationDecisionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Alternate Strong Path A: balanced-high reservation (900/900/900)", () => {
    it("reaches genuine OPTIMAL once the event is sustained, with fallback/shedding/confidence/contingency all left at their untouched defaults", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, HIGH_ACTIONS);
      expect(state.transitions.incidentState).toBe("high-optimal-sustained");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      expect(state.values.regionalConcentrationStatus).toBe("balanced");
      expect(state.values.reservationWasteStatus).toBe("efficient");
      const eligibility = evaluateCompletionEligibility(emergencyCapacityReservationDecisionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("is already protected at arrival-level demand, before the full tail materializes (default-value completeness at the arrival checkpoint)", () => {
      const state = runScenario(EVENT_ARRIVAL_MS + 5_000, HIGH_ACTIONS);
      expect(state.transitions.incidentState).toBe("high-optimal-arrived");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
    });

    it("survives a regional disruption on Region A without ever needing fallback/shedding (default-value completeness at the disruption checkpoint)", () => {
      const state = runScenario(REGIONAL_DISRUPTION_MS + 30_000, HIGH_ACTIONS);
      expect(state.transitions.incidentState).toBe("high-disrupted");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      const eligibility = evaluateCompletionEligibility(emergencyCapacityReservationDecisionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Alternate Strong Path B: moderate reservation (600/600/600) + fallback + shedding", () => {
    it("reaches genuine OPTIMAL once the event is sustained, cheaper than Path A", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, MID_FALLBACK_SHEDDING_ACTIONS);
      expect(state.transitions.incidentState).toBe("mid-optimal-sustained-full");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      expect(state.values.regionalConcentrationStatus).toBe("balanced");
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("is protected already at arrival-level demand", () => {
      const state = runScenario(EVENT_ARRIVAL_MS + 5_000, MID_FALLBACK_SHEDDING_ACTIONS);
      expect(state.transitions.incidentState).toBe("mid-optimal-arrived");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
    });

    it("the bounded fallback is genuinely load-bearing under a regional disruption (default-value completeness: shedding left at default is also tested separately below)", () => {
      const withFallback = runScenario(REGIONAL_DISRUPTION_MS + 30_000, MID_FALLBACK_SHEDDING_ACTIONS);
      expect(withFallback.transitions.incidentState).toBe("mid-disrupted-fallback-enabled");
      expect(withFallback.values.criticalWorkloadProtectionStatus).toBe("protected");

      const withoutFallback = runScenario(REGIONAL_DISRUPTION_MS + 30_000, MID_ACTIONS);
      expect(withoutFallback.transitions.incidentState).toBe("mid-disrupted-no-fallback");
      expect(withoutFallback.values.criticalWorkloadProtectionStatus).toBe("breached");
    });

    it("costs materially less than Path A (real, material cost-efficiency discriminator)", () => {
      const pathA = runScenario(EVENT_SUSTAINED_MS + 30_000, HIGH_ACTIONS);
      const pathB = runScenario(EVENT_SUSTAINED_MS + 30_000, MID_FALLBACK_SHEDDING_ACTIONS);
      expect(pathB.peaks.peakMonthlyCostUsd).toBeLessThan(pathA.peaks.peakMonthlyCostUsd);
      expect(pathA.peaks.peakMonthlyCostUsd - pathB.peaks.peakMonthlyCostUsd).toBeGreaterThan(2_000);
    });
  });

  describe("DEFAULT-VALUE PATH COMPLETENESS: Path B's optional levers left at default", () => {
    it("fallback enabled, shedding left at its untouched default 'none' — still reaches genuine OPTIMAL (not a fallthrough)", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, MID_FALLBACK_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("mid-optimal-sustained-fallback-only");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("BOTH fallback and shedding left at their untouched defaults — reaches a genuinely safe ACCEPTABLE state, never a fallthrough to baseline/unsafe", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, MID_ACTIONS);
      expect(state.transitions.incidentState).toBe("mid-acceptable-sustained-undeclared");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("at-risk");
      expect(state.values.regionalConcentrationStatus).toBe("balanced");
      const eligibility = evaluateCompletionEligibility(emergencyCapacityReservationDecisionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("acceptable");
    });
  });

  describe("Required tempting-but-unsafe trap: cheapest under-reservation (300/300/300)", () => {
    it("violates critical headroom outright once the event arrives, far beyond the bounded fallback's rescue capacity", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, MIN_ACTIONS);
      expect(state.transitions.incidentState).toBe("min-breached-sustained");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("breached");
      const eligibility = evaluateCompletionEligibility(emergencyCapacityReservationDecisionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("is already breached at the arrival-level demand, not only at the full tail", () => {
      const state = runScenario(EVENT_ARRIVAL_MS + 5_000, MIN_ACTIONS);
      expect(state.transitions.incidentState).toBe("min-breached-arrived");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("breached");
    });
  });

  describe("Required tempting-but-unsafe trap: hidden regional concentration (900/300/300)", () => {
    it("looks entirely adequate on aggregate before the regional disruption", () => {
      const state = runScenario(EVENT_SUSTAINED_MS - 5_000, CONC_ACTIONS);
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      expect(state.values.regionalConcentrationStatus).toBe("concentrated");
      // Looking adequate is not the same as being eligible to finish —
      // the concentration risk already disqualifies it from successCondition.
      const eligibility = evaluateCompletionEligibility(emergencyCapacityReservationDecisionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("breaches once Region A — holding the disproportionate share — is independently disrupted, despite the aggregate total having looked adequate", () => {
      const beforeDisruption = runScenario(REGIONAL_DISRUPTION_MS - 5_000, CONC_ACTIONS);
      expect(beforeDisruption.values.criticalWorkloadProtectionStatus).toBe("protected");

      const afterDisruption = runScenario(REGIONAL_DISRUPTION_MS + 30_000, CONC_ACTIONS);
      expect(afterDisruption.transitions.incidentState).toBe("conc-disrupted");
      expect(afterDisruption.values.criticalWorkloadProtectionStatus).toBe("breached");
      expect(afterDisruption.values.regionalConcentrationStatus).toBe("concentrated");
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, afterDisruption);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("the bounded on-demand fallback cannot rescue the concentration trap (unlike the thinness trap below) — the loss exceeds the bound", () => {
      const withFallback = runScenario(REGIONAL_DISRUPTION_MS + 30_000, [
        ...CONC_ACTIONS,
        { atMs: DECISION_WINDOW_OPENED_MS + 5_000, controlKey: ON_DEMAND_FALLBACK_POLICY_KEY, value: "enabled" },
      ]);
      expect(withFallback.values.criticalWorkloadProtectionStatus).toBe("breached");
    });
  });

  describe("Required forecast-confidence-mismatch trap: thin reservation (300/300/600) with forecastConfidenceThreshold left at its default 'p50-only'", () => {
    it("is adequate against arrival-level demand but breaches once the full p99 tail materializes, with no fallback engaged", () => {
      const atArrival = runScenario(EVENT_ARRIVAL_MS + 5_000, THIN_ACTIONS);
      expect(atArrival.transitions.incidentState).toBe("thin-at-risk-arrived");
      expect(atArrival.values.criticalWorkloadProtectionStatus).toBe("at-risk");

      const atSustained = runScenario(EVENT_SUSTAINED_MS + 30_000, THIN_ACTIONS);
      expect(atSustained.transitions.incidentState).toBe("thin-mismatch-breached-sustained");
      expect(atSustained.values.criticalWorkloadProtectionStatus).toBe("breached");
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, atSustained);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("the same thin reservation is genuinely rescued once the bounded fallback is engaged, proving the gap was exactly within the fallback's bound", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, THIN_FALLBACK_ACTIONS);
      expect(state.transitions.incidentState).toBe("thin-rescued-by-fallback-sustained");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });
  });

  describe("Required maximal-reservation-no-regard-for-waste trap: HIGH + large contingency reserve", () => {
    it("is technically safe on headroom but a real, named cost failure — never cleanly OPTIMAL", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, WASTE_ACTIONS);
      expect(state.transitions.incidentState).toBe("high-waste-sustained");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      expect(state.values.regionalConcentrationStatus).toBe("balanced");
      expect(state.values.reservationWasteStatus).toBe("wasteful");
      const eligibility = evaluateCompletionEligibility(emergencyCapacityReservationDecisionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("costs materially more than the genuinely-safe Path A it is built on top of", () => {
      const pathA = runScenario(EVENT_SUSTAINED_MS + 30_000, HIGH_ACTIONS);
      const waste = runScenario(EVENT_SUSTAINED_MS + 30_000, WASTE_ACTIONS);
      expect(waste.peaks.peakMonthlyCostUsd).toBeGreaterThan(pathA.peaks.peakMonthlyCostUsd);
    });

    it("the trap holds just as genuinely during the arrival-only window (before the event is sustained) — not bypassable through the earlier tier", () => {
      // EVENT_ARRIVAL_MS + 19_000 is within [arrival, arrival+20s) with a
      // 20s dwell starting right at arrival (WASTE_ACTIONS' lock-in fires
      // at DECISION_WINDOW_OPENED_MS+5_000, long before arrival), and
      // still well before EVENT_SUSTAINED_MS (arrival + 120_000) — a real
      // arrival-only elapsed time, not the sustained tier.
      const state = runScenario(EVENT_ARRIVAL_MS + 19_000, WASTE_ACTIONS);
      expect(state.transitions.incidentState).toBe("high-waste-arrived");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      expect(state.values.regionalConcentrationStatus).toBe("balanced");
      expect(state.values.reservationWasteStatus).toBe("wasteful");
      expect(state.values.wastedReservedCapacityUnits).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(emergencyCapacityReservationDecisionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Required deadline-missed trap", () => {
    it("never locking in at all leaves reserved capacity at zero and accrues real, non-resetting deadline-miss exposure", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000);
      expect(state.transitions.incidentState).toBe("deadline-missed-event-sustained");
      expect(state.values.reservationDecisionStatus).toBe("deadline-missed");
      expect(state.values.criticalWorkloadProtectionStatus).toBe("breached");
      expect(state.peaks.peakValues["cumulativeDeadlineMissExposureUnits"]).toBeGreaterThan(0);
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("locking in LATE (after the deadline already passed, and after the event has already arrived) still genuinely recovers the live state going forward", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, [
        { atMs: EVENT_ARRIVAL_MS + 5_000, controlKey: RESERVED_CAPACITY_REGION_A_KEY, value: 900 },
        { atMs: EVENT_ARRIVAL_MS + 6_000, controlKey: RESERVED_CAPACITY_REGION_B_KEY, value: 900 },
        { atMs: EVENT_ARRIVAL_MS + 7_000, controlKey: RESERVED_CAPACITY_REGION_C_KEY, value: 900 },
        { atMs: EVENT_ARRIVAL_MS + 8_000, controlKey: RESERVATION_TIMING_KEY, value: "lock-in-now" },
      ]);
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("resolved");
    });

    it("HISTORICAL CONSEQUENCE: the exposure accrued during a deadline miss survives (non-resetting peak) even after a late lock-in genuinely recovers the live state", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, [
        { atMs: EVENT_ARRIVAL_MS + 5_000, controlKey: RESERVED_CAPACITY_REGION_A_KEY, value: 900 },
        { atMs: EVENT_ARRIVAL_MS + 6_000, controlKey: RESERVED_CAPACITY_REGION_B_KEY, value: 900 },
        { atMs: EVENT_ARRIVAL_MS + 7_000, controlKey: RESERVED_CAPACITY_REGION_C_KEY, value: 900 },
        { atMs: EVENT_ARRIVAL_MS + 8_000, controlKey: RESERVATION_TIMING_KEY, value: "lock-in-now" },
      ]);
      // Live state has fully recovered...
      expect(state.values.criticalWorkloadProtectionStatus).toBe("protected");
      // ...but the historical exposure that happened before the late
      // lock-in (every tick between EVENT_ARRIVAL_MS and the lock-in
      // action, while reservationTiming still read "wait") is
      // permanently recorded via the tracked peak, never reset by the
      // later recovery.
      expect(state.peaks.peakValues["cumulativeDeadlineMissExposureUnits"]).toBeGreaterThan(0);
    });
  });

  describe("Score Integrity / Option D: alternate OPTIMAL paths never score below the ACCEPTABLE tier", () => {
    it("Path A (HIGH) and Path B (MID+fallback+shedding) both score above the genuinely-safe ACCEPTABLE tier, with any gap between the two OPTIMAL paths driven by real cost, never by dataIntegrity/reliability", () => {
      const pathAState = runScenario(EVENT_SUSTAINED_MS + 30_000, HIGH_ACTIONS);
      const pathBState = runScenario(EVENT_SUSTAINED_MS + 30_000, MID_FALLBACK_SHEDDING_ACTIONS);
      const acceptableState = runScenario(EVENT_SUSTAINED_MS + 30_000, MID_ACTIONS);

      const pathAFinish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, pathAState);
      const pathBFinish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, pathBState);
      const acceptableFinish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, acceptableState);
      expect(pathAFinish.outcome).toBe("resolved");
      expect(pathBFinish.outcome).toBe("resolved");
      expect(acceptableFinish.outcome).toBe("resolved");

      const pathAInputs = extractFinishScoringInputs(emergencyCapacityReservationDecisionSimulation, pathAFinish);
      const pathBInputs = extractFinishScoringInputs(emergencyCapacityReservationDecisionSimulation, pathBFinish);
      const acceptableInputs = extractFinishScoringInputs(emergencyCapacityReservationDecisionSimulation, acceptableFinish);

      const pathAScore = scoreAuthoredAttempt(EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING, pathAInputs);
      const pathBScore = scoreAuthoredAttempt(EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING, pathBInputs);
      const acceptableScore = scoreAuthoredAttempt(EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING, acceptableInputs);

      // Both OPTIMAL paths score above the ACCEPTABLE tier — the
      // binding Option D requirement.
      expect(pathAScore.total).toBeGreaterThan(acceptableScore.total);
      expect(pathBScore.total).toBeGreaterThan(acceptableScore.total);

      // dataIntegrity/reliability (the correctness-bearing dimensions)
      // are IDENTICAL and maximal between the two OPTIMAL paths — the
      // entire gap between them (if any) is driven by cost alone, never
      // by a correctness regression.
      expect(pathAScore.breakdown.dataIntegrity).toBe(pathBScore.breakdown.dataIntegrity);
      expect(pathAScore.breakdown.reliability).toBe(pathBScore.breakdown.reliability);
      expect(pathAScore.breakdown.dataIntegrity).toBe(200);
      expect(pathBScore.breakdown.dataIntegrity).toBe(200);

      // Path B (cheaper, equally safe) scores at least as well as
      // Path A overall — the real, intentional cost-efficiency reward
      // for the cheaper-but-equally-safe strategy, never a correctness
      // penalty for either path.
      expect(pathBScore.breakdown.costEfficiency).toBeGreaterThan(pathAScore.breakdown.costEfficiency);
      expect(pathBScore.total).toBeGreaterThanOrEqual(pathAScore.total);

      // ACCEPTABLE genuinely trails both OPTIMAL paths on dataIntegrity
      // (the thin-headroom penalty) — a real, named, honest gap, not an
      // arithmetic coincidence.
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(pathAScore.breakdown.dataIntegrity);
    });

    it("the required maximal-waste trap, even though technically safe on headroom, cannot reach a scored completion at all (declared_unstable) — never silently scored as if it were optimal", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, WASTE_ACTIONS);
      const finish = evaluateCandidateDeclaredFinish(emergencyCapacityReservationDecisionSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("running the exact same action sequence twice yields byte-identical final state", () => {
      const stateA = runScenario(EVENT_SUSTAINED_MS + 30_000, MID_FALLBACK_SHEDDING_ACTIONS);
      const stateB = runScenario(EVENT_SUSTAINED_MS + 30_000, MID_FALLBACK_SHEDDING_ACTIONS);
      expect(JSON.stringify(stateA.values)).toBe(JSON.stringify(stateB.values));
      expect(stateA.transitions.incidentState).toBe(stateB.transitions.incidentState);
      expect(stateA.customerImpact.revenueLossUsd).toBe(stateB.customerImpact.revenueLossUsd);
      expect(stateA.peaks.peakMonthlyCostUsd).toBe(stateB.peaks.peakMonthlyCostUsd);
    });
  });

  describe("Timeline causality labeling", () => {
    it("uses explicit causality-label prefixes for deadline/event progression", () => {
      const messages = emergencyCapacityReservationDecisionSimulation.timedEvents.map((e) => e.message);
      expect(messages.some((m) => m.startsWith("DEADLINE PROGRESSION:"))).toBe(true);
      expect(messages.some((m) => m.startsWith("EXTERNAL PROGRESSION:"))).toBe(true);
    });
  });

  describe("Sequencing: N/A (honest negative audit)", () => {
    it("no two controls produce a different outcome purely from being set in a different order (this scenario's levers are independent commitments, not an ordered rollout)", () => {
      const orderA = runScenario(EVENT_SUSTAINED_MS + 30_000, MID_FALLBACK_SHEDDING_ACTIONS);
      const reordered: TimedAction[] = [
        { atMs: DECISION_WINDOW_OPENED_MS + 1_000, controlKey: OPTIONAL_WORKLOAD_SHEDDING_KEY, value: "shed-under-pressure" },
        { atMs: DECISION_WINDOW_OPENED_MS + 2_000, controlKey: ON_DEMAND_FALLBACK_POLICY_KEY, value: "enabled" },
        { atMs: DECISION_WINDOW_OPENED_MS + 3_000, controlKey: RESERVED_CAPACITY_REGION_C_KEY, value: 600 },
        { atMs: DECISION_WINDOW_OPENED_MS + 4_000, controlKey: RESERVED_CAPACITY_REGION_B_KEY, value: 600 },
        { atMs: DECISION_WINDOW_OPENED_MS + 5_000, controlKey: RESERVED_CAPACITY_REGION_A_KEY, value: 600 },
        { atMs: DECISION_WINDOW_OPENED_MS + 6_000, controlKey: RESERVATION_TIMING_KEY, value: "lock-in-now" },
      ];
      const orderB = runScenario(EVENT_SUSTAINED_MS + 30_000, reordered);
      expect(orderA.transitions.incidentState).toBe(orderB.transitions.incidentState);
      expect(orderA.values.criticalWorkloadProtectionStatus).toBe(orderB.values.criticalWorkloadProtectionStatus);
    });
  });

  describe("Recovery-lag: N/A (honest negative audit)", () => {
    it("critical protection status responds to the current region/fallback/shedding configuration on the very next tick once the event is live, with no separate multi-tick drain window of its own", () => {
      // The event's own two-stage demand escalation (arrival -> sustained)
      // is a real, deliberate timed progression, but it is driven by
      // EXTERNAL PROGRESSION (the event itself), never by a recovery-lag
      // drain window following a candidate's corrective action — unlike
      // Data Retention Policy Misconfiguration's drain windows, nothing
      // here needs several extra minutes to "finish re-validating" after
      // a safe configuration is engaged.
      const justBeforeArrival = runScenario(EVENT_ARRIVAL_MS - 1_000, HIGH_ACTIONS);
      expect(justBeforeArrival.values.criticalWorkloadProtectionStatus).toBe("not-yet-exposed");
      const rightAtArrival = runScenario(EVENT_ARRIVAL_MS + 1_000, HIGH_ACTIONS);
      expect(rightAtArrival.values.criticalWorkloadProtectionStatus).toBe("protected");
    });
  });

  describe("Pressure-transfer: N/A (honest negative audit)", () => {
    it("no control here relieves pressure on one node by transferring load onto another live dependency — every lever is a reservation amount, a policy choice, or a timing decision, never a scale-X-overload-Y mechanic", () => {
      const state = runScenario(EVENT_SUSTAINED_MS + 30_000, HIGH_ACTIONS);
      expect(Object.keys(state.componentHealth)).toEqual(
        expect.arrayContaining(["demand-forecasting", "capacity-planner", "region-a", "region-b", "region-c", "reserved-capacity", "on-demand-capacity"]),
      );
      // demand-forecasting and capacity-planner never leave "healthy" in
      // any authored rule — they are the decision-making nodes, never a
      // downstream dependency that could be overloaded by a candidate's
      // own choice.
      expect(state.componentHealth["demand-forecasting"]).toBe("healthy");
      expect(state.componentHealth["capacity-planner"]).toBe("healthy");
    });
  });

  describe("Forecast confidence threshold is a real, non-dead control", () => {
    it("is read by action-classifications (harmful when left at its default 'p50-only')", () => {
      const rule = emergencyCapacityReservationDecisionSimulation.actionClassifications.find(
        (r) => r.controlKey === FORECAST_CONFIDENCE_THRESHOLD_KEY && r.valueEquals === "p50-only",
      );
      expect(rule?.outcome).toBe("harmful");
    });
  });
});
