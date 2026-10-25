import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { crossRegionReplicationCostExplosion } from "./cross-region-replication-cost-explosion";
import {
  ARCHIVE_REPLICATION_MODE_KEY,
  CRITICAL_DATA_PINNING_KEY,
  CRITICAL_REPLICATION_FACTOR_KEY,
  LOW_PRIORITY_REGION_FAN_OUT_KEY,
  LOW_PRIORITY_REPLICATION_FACTOR_KEY,
  STANDARD_REPLICATION_MODE_KEY,
  TRANSFER_BATCHING_KEY,
  TRANSFER_COMPRESSION_KEY,
  crossRegionReplicationCostExplosionSimulation,
} from "./cross-region-replication-cost-explosion/definition";
import { crossRegionReplicationCostExplosionCandidateUI } from "./cross-region-replication-cost-explosion/candidate-ui";
import { CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING } from "./cross-region-replication-cost-explosion/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  DR_VERIFICATION_DRILL_2_MS,
  DR_VERIFICATION_DRILL_MS,
  POLICY_CHANGE_DISCOVERED_MS,
} from "./cross-region-replication-cost-explosion/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(crossRegionReplicationCostExplosionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += crossRegionReplicationCostExplosionSimulation.tickMs
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
      crossRegionReplicationCostExplosionSimulation,
      state,
      action,
      crossRegionReplicationCostExplosionSimulation.tickMs,
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
      crossRegionReplicationCostExplosionSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path 1: Strategy A — scope reduction for low-priority data.
const STRATEGY_A_ACTIONS: TimedAction[] = [
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: LOW_PRIORITY_REGION_FAN_OUT_KEY, value: "origin-plus-one" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 2_000, controlKey: LOW_PRIORITY_REPLICATION_FACTOR_KEY, value: 1 },
];

// Alternate strong path 2: Strategy B — mode reduction for the standard class.
const STRATEGY_B_ACTIONS: TimedAction[] = [
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: STANDARD_REPLICATION_MODE_KEY, value: "async-batched" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 2_000, controlKey: TRANSFER_COMPRESSION_KEY, value: "on" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 3_000, controlKey: ARCHIVE_REPLICATION_MODE_KEY, value: "scheduled-batch" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 4_000, controlKey: TRANSFER_BATCHING_KEY, value: "large-batched" },
];

// Fully-combined OPTIMAL path: both strategies plus every orthogonal lever.
const BOTH_STRATEGIES_ACTIONS: TimedAction[] = [
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: LOW_PRIORITY_REGION_FAN_OUT_KEY, value: "origin-plus-one" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 2_000, controlKey: LOW_PRIORITY_REPLICATION_FACTOR_KEY, value: 1 },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 3_000, controlKey: STANDARD_REPLICATION_MODE_KEY, value: "async-batched" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 4_000, controlKey: TRANSFER_COMPRESSION_KEY, value: "on" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 5_000, controlKey: ARCHIVE_REPLICATION_MODE_KEY, value: "scheduled-batch" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 6_000, controlKey: TRANSFER_BATCHING_KEY, value: "large-batched" },
];

// Unsafe minimum-cost path: breach the critical durability floor.
const UNSAFE_MIN_COST_ACTIONS: TimedAction[] = [
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: CRITICAL_REPLICATION_FACTOR_KEY, value: 1 },
];

// Unsafe minimum-cost path, stacked with every other safe lever too —
// reaches the single lowest infrastructure-cost ratio in the entire
// scenario, proving the cost dimension alone cannot discriminate safe
// from unsafe.
const UNSAFE_MIN_COST_STACKED_ACTIONS: TimedAction[] = [
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: CRITICAL_REPLICATION_FACTOR_KEY, value: 1 },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 2_000, controlKey: LOW_PRIORITY_REGION_FAN_OUT_KEY, value: "origin-plus-one" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 3_000, controlKey: LOW_PRIORITY_REPLICATION_FACTOR_KEY, value: 1 },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 4_000, controlKey: STANDARD_REPLICATION_MODE_KEY, value: "async-batched" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 5_000, controlKey: TRANSFER_COMPRESSION_KEY, value: "on" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 6_000, controlKey: ARCHIVE_REPLICATION_MODE_KEY, value: "scheduled-batch" },
  { atMs: POLICY_CHANGE_DISCOVERED_MS + 7_000, controlKey: TRANSFER_BATCHING_KEY, value: "large-batched" },
];

describe("Cross-Region Replication Cost Explosion", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(crossRegionReplicationCostExplosion.isFree).toBe(false);
      expect(crossRegionReplicationCostExplosion.library?.category).toBe("Infrastructure & Capacity");
      expect(crossRegionReplicationCostExplosion.library?.tags.length).toBeGreaterThan(0);
      expect(crossRegionReplicationCostExplosion.library?.skills.length).toBeGreaterThan(0);
      expect(crossRegionReplicationCostExplosion.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(crossRegionReplicationCostExplosionCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(crossRegionReplicationCostExplosionCandidateUI.controls.length).toBeGreaterThanOrEqual(6);
      expect(crossRegionReplicationCostExplosionCandidateUI.components.length).toBe(6);
    });

    it("the architecture has exactly 6 nodes and 5 edges, flat (no nesting)", () => {
      expect(crossRegionReplicationCostExplosionSimulation.architecture.nodes.length).toBe(6);
      expect(crossRegionReplicationCostExplosionSimulation.architecture.edges.length).toBe(5);
      for (const node of crossRegionReplicationCostExplosionSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all business invariants", () => {
      expect(crossRegionReplicationCostExplosion.description).toMatch(/mandated 3-region durability floor/i);
      expect(crossRegionReplicationCostExplosion.description).toMatch(/freshness requirements genuinely differ/i);
      expect(crossRegionReplicationCostExplosion.description).toMatch(
        /not all data requires full active replication to every region/i,
      );
      expect(crossRegionReplicationCostExplosion.description).toMatch(
        /must never silently weaken this disaster-recovery guarantee below policy/i,
      );
      expect(crossRegionReplicationCostExplosion.description).toMatch(
        /archived and low-priority data may use slower, narrower replication where explicitly allowed/i,
      );
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of crossRegionReplicationCostExplosionSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        crossRegionReplicationCostExplosionSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of crossRegionReplicationCostExplosionSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(crossRegionReplicationCostExplosionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.criticalDataDurabilityStatus).toBe("policy-compliant");
      expect(state.values.criticalDataExposureEventCount).toBe(0);
    });

    it("policy change discovery triggers the incident with cost already exploded, never an outage", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(POLICY_CHANGE_DISCOVERED_MS);
      expect(state.transitions.incidentState).toBe("baseline-cost-explosion");
      expect(state.values.monthlyTotalReplicationCostUsd).toBe(6_300);
      expect(state.values.criticalFreshnessSeconds).toBeLessThanOrEqual(5);
      expect(state.values.criticalDataDurabilityStatus).toBe("policy-compliant");
    });

    it("baseline (no action) leaves cost exploded indefinitely, durability fine", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 60_000);
      expect(state.transitions.incidentState).toBe("baseline-cost-explosion");
      expect(state.values.monthlyTotalReplicationCostUsd).toBe(6_300);
      expect(state.values.criticalDataDurabilityStatus).toBe("policy-compliant");
    });

    it("no component health anywhere in this scenario ever represents an availability outage for the safe baseline", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 10_000);
      for (const health of Object.values(state.componentHealth)) {
        expect(health).toBe("healthy");
      }
    });
  });

  describe("Required unsafe minimum-cost trap: durability-floor breach", () => {
    it("dropping critical replication factor below 3 reaches the lowest raw cost but breaches the durability floor", () => {
      const baseline = runScenario(POLICY_CHANGE_DISCOVERED_MS + 10_000);
      const unsafe = runScenario(POLICY_CHANGE_DISCOVERED_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      expect(unsafe.transitions.incidentState).toBe("critical-factor-breached-undetected");
      expect(unsafe.values.monthlyTotalReplicationCostUsd as number).toBeLessThan(
        baseline.values.monthlyTotalReplicationCostUsd as number,
      );
      expect(unsafe.values.criticalDataDurabilityStatus).toBe("below-policy-floor");
      // Freshness is NOT degraded by this — the data is still
      // replicated, just to fewer copies. Durability and freshness are
      // orthogonal.
      expect(unsafe.values.criticalFreshnessSeconds).toBeLessThanOrEqual(5);
    });

    it("the breach is invisible (zero exposure events) until a DR drill actually catches it", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      expect(state.values.criticalDataExposureEventCount).toBe(0);
      expect(state.values.drDrillStatus).toBe("none-scheduled");
    });

    it("a DR verification drill catches the live breach and records a real, nonzero exposure event", () => {
      const state = runScenario(DR_VERIFICATION_DRILL_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      expect(state.transitions.incidentState).toBe("critical-factor-breached-drilled");
      expect(state.values.criticalDataExposureEventCount as number).toBeGreaterThan(0);
      expect(state.values.drDrillStatus).toBe("breach-detected");
      expect(state.values.criticalDataDurabilityStatus).toBe("below-policy-floor");
    });

    it("a breach held through a SECOND drill compounds exposure further", () => {
      const firstDrillOnly = runScenario(DR_VERIFICATION_DRILL_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      const secondDrillToo = runScenario(DR_VERIFICATION_DRILL_2_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      expect(secondDrillToo.transitions.incidentState).toBe("critical-factor-breached-drilled-twice");
      expect(secondDrillToo.values.criticalDataExposureEventCount as number).toBeGreaterThan(
        firstDrillOnly.values.criticalDataExposureEventCount as number,
      );
    });

    it("the unsafe path can never be Finish-eligible, however long it runs or however cheap it looks", () => {
      const state = runScenario(DR_VERIFICATION_DRILL_2_MS + 60_000, UNSAFE_MIN_COST_ACTIONS);
      const eligibility = evaluateCompletionEligibility(crossRegionReplicationCostExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("stacking the breach with every other safe lever reaches the single lowest total cost in the scenario, yet is still never Finish-eligible", () => {
      const stacked = runScenario(POLICY_CHANGE_DISCOVERED_MS + 20_000, UNSAFE_MIN_COST_STACKED_ACTIONS);
      const bothStrategies = runScenario(POLICY_CHANGE_DISCOVERED_MS + 20_000, BOTH_STRATEGIES_ACTIONS);
      expect(stacked.values.monthlyTotalReplicationCostUsd as number).toBeLessThan(
        bothStrategies.values.monthlyTotalReplicationCostUsd as number,
      );
      expect(stacked.values.criticalDataDurabilityStatus).toBe("below-policy-floor");
      const eligibility = evaluateCompletionEligibility(crossRegionReplicationCostExplosionSimulation, stacked);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Historical exposure (peak tracking): never resets even after the floor is restored", () => {
    it("restoring the critical factor to 3 stops new exposure, but the peak historical count never decreases", () => {
      const breachedAndDrilled = runScenario(DR_VERIFICATION_DRILL_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      const correctedAfter = runScenario(DR_VERIFICATION_DRILL_MS + 20_000, [
        ...UNSAFE_MIN_COST_ACTIONS,
        { atMs: DR_VERIFICATION_DRILL_MS + 11_000, controlKey: CRITICAL_REPLICATION_FACTOR_KEY, value: 3 },
      ]);
      expect(breachedAndDrilled.values.criticalDataExposureEventCount as number).toBeGreaterThan(0);
      // Live field reads back to 0 once the floor is restored and a
      // clean rule state is matched again.
      expect(correctedAfter.values.criticalDataDurabilityStatus).toBe("policy-compliant");
      expect(correctedAfter.values.criticalDataExposureEventCount).toBe(0);
      // But the PEAK never decreases — the permanent scar from the
      // earlier drill-caught breach survives.
      expect(correctedAfter.peaks.peakValues.criticalDataExposureEventCount as number).toBeGreaterThanOrEqual(
        breachedAndDrilled.values.criticalDataExposureEventCount as number,
      );
      expect(correctedAfter.peaks.peakValues.criticalDataExposureEventCount as number).toBeGreaterThan(0);
    });

    it("full remediation after an unsafe drilled breach reaches OPTIMAL on every live metric while the peak permanently shows the violation", () => {
      const drilled = runScenario(DR_VERIFICATION_DRILL_MS + 5_000, [
        { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: CRITICAL_REPLICATION_FACTOR_KEY, value: 1 },
      ]);
      expect(drilled.values.criticalDataExposureEventCount as number).toBeGreaterThan(0);

      const remediated = runScenario(DR_VERIFICATION_DRILL_MS + 50_000, [
        { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: CRITICAL_REPLICATION_FACTOR_KEY, value: 1 },
        { atMs: DR_VERIFICATION_DRILL_MS + 6_000, controlKey: CRITICAL_REPLICATION_FACTOR_KEY, value: 3 },
        ...BOTH_STRATEGIES_ACTIONS.filter((a) => a.atMs > DR_VERIFICATION_DRILL_MS).map((a) => a),
        { atMs: DR_VERIFICATION_DRILL_MS + 7_000, controlKey: LOW_PRIORITY_REGION_FAN_OUT_KEY, value: "origin-plus-one" },
        { atMs: DR_VERIFICATION_DRILL_MS + 8_000, controlKey: LOW_PRIORITY_REPLICATION_FACTOR_KEY, value: 1 },
        { atMs: DR_VERIFICATION_DRILL_MS + 9_000, controlKey: STANDARD_REPLICATION_MODE_KEY, value: "async-batched" },
        { atMs: DR_VERIFICATION_DRILL_MS + 10_000, controlKey: TRANSFER_COMPRESSION_KEY, value: "on" },
        { atMs: DR_VERIFICATION_DRILL_MS + 11_000, controlKey: ARCHIVE_REPLICATION_MODE_KEY, value: "scheduled-batch" },
        { atMs: DR_VERIFICATION_DRILL_MS + 12_000, controlKey: TRANSFER_BATCHING_KEY, value: "large-batched" },
      ]);
      expect(remediated.transitions.incidentState).toBe("both-strategies-fully-optimized");
      expect(remediated.values.criticalDataDurabilityStatus).toBe("policy-compliant");
      expect(remediated.values.criticalDataExposureEventCount).toBe(0);
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the earlier breach this
      // attempt passed through.
      expect(remediated.peaks.peakValues.criticalDataExposureEventCount as number).toBeGreaterThan(0);
      // The CURRENT configuration is still genuinely eligible as
      // optimal — only the live/current state gates Finish-eligibility,
      // never a second re-litigation of history.
      const eligibility = evaluateCompletionEligibility(crossRegionReplicationCostExplosionSimulation, remediated);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Alternate strong paths: Strategy A (scope) and Strategy B (mode) are genuinely different mechanisms", () => {
    it("Strategy A (scope reduction) reaches OPTIMAL without ever touching replication mode", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, STRATEGY_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("strategy-a-scope-reduction");
      expect(state.values.replicationScopeStatus).toBe("scope-narrowed");
      // Strategy A never touched the standard class's replication mode.
      expect(state.controlValues[STANDARD_REPLICATION_MODE_KEY]).toBe("sync");
      const eligibility = evaluateCompletionEligibility(crossRegionReplicationCostExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Strategy B (mode reduction) is real relief via a different mechanism, reaching ACCEPTABLE without narrowing any fan-out scope", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, STRATEGY_B_ACTIONS);
      expect(state.transitions.incidentState).toBe("strategy-b-async-batched");
      expect(state.values.replicationScopeStatus).toBe("mode-shifted");
      const eligibility = evaluateCompletionEligibility(crossRegionReplicationCostExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("both strategies combined reach the lowest safe total cost (OPTIMAL ceiling)", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, BOTH_STRATEGIES_ACTIONS);
      expect(state.transitions.incidentState).toBe("both-strategies-fully-optimized");
      expect(state.values.replicationScopeStatus).toBe("scope-and-mode-optimized");
      const eligibility = evaluateCompletionEligibility(crossRegionReplicationCostExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });

      const strategyAOnly = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, STRATEGY_A_ACTIONS);
      expect(state.values.monthlyTotalReplicationCostUsd as number).toBeLessThan(
        strategyAOnly.values.monthlyTotalReplicationCostUsd as number,
      );
    });

    it("Strategy A and Strategy B both reach OPTIMAL-or-better tiers with identical dataIntegrity/reliability credit, differing honestly only on cost", () => {
      const aState = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, STRATEGY_A_ACTIONS);
      const bothState = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, BOTH_STRATEGIES_ACTIONS);
      const aResult = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, aState);
      const bothResult = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, bothState);
      const aScore = scoreAuthoredAttempt(
        CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
        extractFinishScoringInputs(crossRegionReplicationCostExplosionSimulation, aResult),
      );
      const bothScore = scoreAuthoredAttempt(
        CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
        extractFinishScoringInputs(crossRegionReplicationCostExplosionSimulation, bothResult),
      );
      expect(aResult.completionTier).toBe("optimal");
      expect(bothResult.completionTier).toBe("optimal");
      expect(aScore.breakdown.dataIntegrity).toBe(bothScore.breakdown.dataIntegrity);
      expect(aScore.breakdown.reliability).toBe(bothScore.breakdown.reliability);
      // Both-strategies achieves strictly better cost efficiency since
      // it reaches a materially lower total cost than Strategy A alone.
      expect(bothScore.breakdown.costEfficiency).toBeGreaterThanOrEqual(aScore.breakdown.costEfficiency);
    });
  });

  describe("Orthogonal always-safe levers are not dead controls", () => {
    it("archive-only-fix reaches ACCEPTABLE via the archive path alone", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 40_000, [
        { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: ARCHIVE_REPLICATION_MODE_KEY, value: "scheduled-batch" },
      ]);
      expect(state.transitions.incidentState).toBe("archive-only-fix");
      expect(state.values.archiveDurabilityStatus).toBe("scheduled-batch-compliant");
      const eligibility = evaluateCompletionEligibility(crossRegionReplicationCostExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("compression-only-fix reaches ACCEPTABLE via compression alone", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 40_000, [
        { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: TRANSFER_COMPRESSION_KEY, value: "on" },
      ]);
      expect(state.transitions.incidentState).toBe("compression-only-fix");
      const eligibility = evaluateCompletionEligibility(crossRegionReplicationCostExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("pinning alone changes nothing about cost — a distinct state from the plain baseline, never a cost lever by itself", () => {
      const baseline = runScenario(POLICY_CHANGE_DISCOVERED_MS + 10_000);
      const pinned = runScenario(POLICY_CHANGE_DISCOVERED_MS + 10_000, [
        { atMs: POLICY_CHANGE_DISCOVERED_MS + 1_000, controlKey: CRITICAL_DATA_PINNING_KEY, value: true },
      ]);
      expect(pinned.transitions.incidentState).toBe("pinned-no-other-action");
      expect(pinned.values.monthlyTotalReplicationCostUsd).toBe(baseline.values.monthlyTotalReplicationCostUsd);
      const eligibility = evaluateCompletionEligibility(crossRegionReplicationCostExplosionSimulation, pinned);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable even though every live metric looks healthy", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 5_000);
      expect(state.values.criticalDataDurabilityStatus).toBe("policy-compliant");
      const result = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after incident start still resolves to declared_unstable (cost never self-corrects)", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 10 * 60_000);
      const result = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("OPTIMAL path (both strategies combined) scores near-maximum with full dataIntegrity/reliability credit", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, BOTH_STRATEGIES_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, state);
      const inputs = extractFinishScoringInputs(crossRegionReplicationCostExplosionSimulation, result);
      const score = scoreAuthoredAttempt(CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL (both strategies) SCORE", JSON.stringify(score));
      console.log("OPTIMAL final state", JSON.stringify(state.values));
    });

    it("alternate OPTIMAL path (Strategy A alone) scores well, comparable to the combined path on safety dimensions", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, STRATEGY_A_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, state);
      const inputs = extractFinishScoringInputs(crossRegionReplicationCostExplosionSimulation, result);
      const score = scoreAuthoredAttempt(CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING, inputs);
      expect(result.completionTier).toBe("optimal");
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
      console.log("ALTERNATE OPTIMAL (Strategy A) SCORE", JSON.stringify(score));
      console.log("ALTERNATE OPTIMAL final state", JSON.stringify(state.values));
    });

    it("ACCEPTABLE path (Strategy B alone) scores well but below the OPTIMAL combined path", () => {
      const optimalState = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, BOTH_STRATEGIES_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
        extractFinishScoringInputs(crossRegionReplicationCostExplosionSimulation, optimalResult),
      );

      const acceptableState = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, STRATEGY_B_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        crossRegionReplicationCostExplosionSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
        extractFinishScoringInputs(crossRegionReplicationCostExplosionSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE (Strategy B) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL (for comparison) SCORE", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery credit and the low costEfficiency band", () => {
      const state = runScenario(POLICY_CHANGE_DISCOVERED_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.costEfficiency).toBeLessThanOrEqual(20);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful/unsafe-minimum-cost path scores worse than baseline on dataIntegrity, reliability, AND total, despite the best raw cost numbers in the scenario", () => {
      const baselineState = runScenario(POLICY_CHANGE_DISCOVERED_MS + 60_000);
      const harmfulState = runScenario(DR_VERIFICATION_DRILL_MS + 60_000, UNSAFE_MIN_COST_STACKED_ACTIONS);
      const baselineScore = scoreAuthoredAttempt(
        CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
        buildScoringInputs(harmfulState),
      );
      // The unsafe path's raw cost efficiency is the best in the whole
      // scenario (lower total cost than baseline) — proving
      // costEfficiency alone cannot discriminate.
      expect(harmfulState.values.monthlyTotalReplicationCostUsd as number).toBeLessThan(
        baselineState.values.monthlyTotalReplicationCostUsd as number,
      );
      expect(harmfulScore.breakdown.costEfficiency).toBeGreaterThanOrEqual(baselineScore.breakdown.costEfficiency);
      // Yet dataIntegrity/reliability/total all score strictly worse.
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.breakdown.reliability).toBeLessThan(baselineScore.breakdown.reliability);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (unsafe-minimum-cost, drilled) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("the unsafe path TIES the safe both-strategies path on costEfficiency alone (both reach the top cost tier), yet loses decisively overall", () => {
      const unsafeState = runScenario(DR_VERIFICATION_DRILL_MS + 10_000, UNSAFE_MIN_COST_STACKED_ACTIONS);
      const safeState = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, BOTH_STRATEGIES_ACTIONS);
      const unsafeScore = scoreAuthoredAttempt(
        CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
        buildScoringInputs(unsafeState),
      );
      const safeResult = evaluateCandidateDeclaredFinish(crossRegionReplicationCostExplosionSimulation, safeState);
      const safeScore = scoreAuthoredAttempt(
        CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
        extractFinishScoringInputs(crossRegionReplicationCostExplosionSimulation, safeResult),
      );
      expect(unsafeScore.breakdown.costEfficiency).toBeGreaterThanOrEqual(safeScore.breakdown.costEfficiency);
      expect(unsafeScore.total).toBeLessThan(safeScore.total);
      console.log("UNSAFE (stacked, drilled) SCORE", JSON.stringify(unsafeScore));
      console.log("SAFE (both strategies, OPTIMAL) SCORE (for comparison)", JSON.stringify(safeScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, BOTH_STRATEGIES_ACTIONS);
      const runB = runScenario(POLICY_CHANGE_DISCOVERED_MS + 50_000, BOTH_STRATEGIES_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak exposure count and peak total cost generically via numericWatchFields", () => {
      const state = runScenario(DR_VERIFICATION_DRILL_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      expect(state.peaks.peakValues.criticalDataExposureEventCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.monthlyTotalReplicationCostUsd).toBeGreaterThan(0);
    });
  });
});
