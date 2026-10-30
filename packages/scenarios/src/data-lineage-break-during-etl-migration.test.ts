import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { dataLineageBreakDuringEtlMigration } from "./data-lineage-break-during-etl-migration";
import {
  CUTOVER_AUDIT_LOG_KEY,
  CUTOVER_STRATEGY_KEY,
  LEGACY_PATH_DECOMMISSION_KEY,
  LINEAGE_FLAGGING_KEY,
  RECONCILIATION_DEPTH_KEY,
  REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
  dataLineageBreakDuringEtlMigrationSimulation,
} from "./data-lineage-break-during-etl-migration/definition";
import { dataLineageBreakDuringEtlMigrationCandidateUI } from "./data-lineage-break-during-etl-migration/candidate-ui";
import { DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING } from "./data-lineage-break-during-etl-migration/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  CUTOVER_WINDOW_1_MS,
  CUTOVER_WINDOW_2_MS,
  CUTOVER_FULLY_COMPLETE_MS,
  MIGRATION_ONSET_MS,
  SUSTAINED_UNDECIDED_MS,
} from "./data-lineage-break-during-etl-migration/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(dataLineageBreakDuringEtlMigrationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += dataLineageBreakDuringEtlMigrationSimulation.tickMs
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
      dataLineageBreakDuringEtlMigrationSimulation,
      state,
      action,
      dataLineageBreakDuringEtlMigrationSimulation.tickMs,
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
      dataLineageBreakDuringEtlMigrationSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: staged-per-source cutover — genuinely safe
// immediately (zero mixed-lineage metrics), full completion once the
// full cutover window elapses. Only the strategy control is set — every
// other control is deliberately left at its UNTOUCHED DEFAULT value
// (lineageFlagging=false, cutoverAuditLog=false,
// reportGateOnInconsistentLineage=false, legacyPathDecommission=
// "keep-both") per the default-value path completeness audit below.
const STAGED_ONLY_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_UNDECIDED_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "staged-per-source" },
];

// Alternate strong path B: dual-write-reconcile — genuinely safe
// immediately, full completion once the full cutover window elapses.
// reconciliationDepth is deliberately left at its UNTOUCHED DEFAULT
// value ("shallow"), as are every other non-strategy control.
const DUAL_WRITE_ONLY_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_UNDECIDED_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "dual-write-reconcile" },
];

const DUAL_WRITE_FULL_DEPTH_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_UNDECIDED_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "dual-write-reconcile" },
  { atMs: SUSTAINED_UNDECIDED_MS + 2_000, controlKey: RECONCILIATION_DEPTH_KEY, value: "full" },
];

describe("Data Lineage Break During ETL Migration", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(dataLineageBreakDuringEtlMigration.isFree).toBe(false);
      expect(dataLineageBreakDuringEtlMigration.library?.category).toBe("Data Pipelines");
      expect(dataLineageBreakDuringEtlMigration.library?.tags.length).toBeGreaterThan(0);
      expect(dataLineageBreakDuringEtlMigration.library?.skills.length).toBeGreaterThan(0);
      expect(dataLineageBreakDuringEtlMigration.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(dataLineageBreakDuringEtlMigrationCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(dataLineageBreakDuringEtlMigrationCandidateUI.controls.length).toBeGreaterThanOrEqual(6);
      expect(dataLineageBreakDuringEtlMigrationCandidateUI.components.length).toBe(6);
    });

    it("the architecture is a flat 6-node, 6-edge migration topology matching the spec", () => {
      expect(dataLineageBreakDuringEtlMigrationSimulation.architecture.nodes.length).toBe(6);
      expect(dataLineageBreakDuringEtlMigrationSimulation.architecture.edges.length).toBe(6);
      for (const node of dataLineageBreakDuringEtlMigrationSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all four business invariants", () => {
      expect(dataLineageBreakDuringEtlMigration.description).toMatch(
        /must never silently mix v1-derived and v2-derived data/i,
      );
      expect(dataLineageBreakDuringEtlMigration.description).toMatch(
        /migration cutover must be traceable and auditable per source\/metric/i,
      );
      expect(dataLineageBreakDuringEtlMigration.description).toMatch(
        /must be able to know that through a visible untrusted\/flagged state/i,
      );
      expect(dataLineageBreakDuringEtlMigration.description).toMatch(
        /a real, non-resetting historical consequence/i,
      );
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of dataLineageBreakDuringEtlMigrationSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        dataLineageBreakDuringEtlMigrationSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of dataLineageBreakDuringEtlMigrationSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(dataLineageBreakDuringEtlMigrationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.metricsWithMixedLineagePercent).toBe(0);
      expect(state.values.lineageConsistencyStatus).toBe("consistent");
      expect(state.values.reportsServedWhileInconsistentCount).toBe(0);
    });

    it("migration onset triggers the incident, never touching availability", () => {
      const state = runScenario(MIGRATION_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(MIGRATION_ONSET_MS);
      expect(state.values.sourcesAvailabilityPercent).toBe(100);
      expect(state.values.warehouseWriteSuccessRate).toBe(100);
      expect(state.values.reportGenerationSuccessRate).toBe(100);
    });

    it("leaving cutover strategy undecided never mixes lineage, but never progresses the migration either (the core decoy)", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 5_000);
      expect(state.transitions.incidentState).toBe("undecided-sustained");
      expect(state.values.sourcesAvailabilityPercent).toBe(100);
      expect(state.values.warehouseWriteSuccessRate).toBe(100);
      expect(state.values.reportGenerationSuccessRate).toBe(100);
      expect(state.values.metricsWithMixedLineagePercent).toBe(0);
      expect(state.values.migrationStatus).toBe("not-started");
    });
  });

  describe("Required lineage-trust trap: silent global flip never shows up on availability", () => {
    it("global-flip + unflagged creates real, nonzero mixed-lineage exposure while availability stays perfect", () => {
      const baseline = runScenario(SUSTAINED_UNDECIDED_MS + 5_000);
      const silent = runScenario(SUSTAINED_UNDECIDED_MS + 5_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      expect(silent.transitions.incidentState).toBe("global-flip-silent-sustained");
      // Availability is IDENTICAL to baseline — the trap is invisible on
      // availability health.
      expect(silent.values.sourcesAvailabilityPercent).toBe(baseline.values.sourcesAvailabilityPercent);
      expect(silent.values.warehouseWriteSuccessRate).toBe(baseline.values.warehouseWriteSuccessRate);
      expect(silent.values.reportGenerationSuccessRate).toBe(baseline.values.reportGenerationSuccessRate);
      expect(silent.values.metricsWithMixedLineagePercent as number).toBeGreaterThan(0);
      expect(silent.values.reportsServedWhileInconsistentCount as number).toBeGreaterThan(0);
      expect(silent.values.lineageConsistencyStatus).toBe("inconsistent-silent");
    });

    it("silent global-flip held longer compounds the reports-served-while-inconsistent count further", () => {
      const early = runScenario(MIGRATION_ONSET_MS + 10_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      const sustained = runScenario(SUSTAINED_UNDECIDED_MS + 10_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      expect(sustained.values.reportsServedWhileInconsistentCount as number).toBeGreaterThan(
        early.values.reportsServedWhileInconsistentCount as number,
      );
    });

    it("silent global-flip can never be Finish-eligible, however long it runs", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 60_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("sustained silent global-flip exposure stays active (never auto-fails) even long past the old sustained-failure window, while consecutiveFailureSeconds proves the breach really did sustain", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 15 * 60_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        dataLineageBreakDuringEtlMigrationSimulation.failureCondition.sustainedSeconds,
      );
      const finish = evaluateCandidateDeclaredFinish(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Lineage-trust QA: silent global-flip cannot be laundered into a safe outcome", () => {
    it("flagging afterward makes the exposure visible but the peak historical count never decreases", () => {
      const sealedUnsafeState = runScenario(MIGRATION_ONSET_MS + 10_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      const correctedState = runScenario(MIGRATION_ONSET_MS + 20_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
        { atMs: MIGRATION_ONSET_MS + 11_000, controlKey: LINEAGE_FLAGGING_KEY, value: true },
      ]);
      expect(sealedUnsafeState.values.metricsWithMixedLineagePercent as number).toBeGreaterThan(0);
      // Live correctness: flagging alone (without gating) still shows
      // the exposure honestly rather than silently granting it, but the
      // field we assert on here is the PEAK historical record.
      expect(correctedState.peaks.peakValues.reportsServedWhileInconsistentCount as number).toBeGreaterThanOrEqual(
        sealedUnsafeState.values.reportsServedWhileInconsistentCount as number,
      );
    });

    it("full remediation after an unsafe global-flip window reaches OPTIMAL on every live metric while the peak historical record permanently shows the violation", () => {
      const state = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
        { atMs: MIGRATION_ONSET_MS + 2_000, controlKey: CUTOVER_STRATEGY_KEY, value: "staged-per-source" },
      ]);
      expect(state.transitions.incidentState).toBe("staged-fully-complete");
      expect(state.values.metricsWithMixedLineagePercent).toBe(0);
      expect(state.values.lineageConsistencyStatus).toBe("consistent");
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the earlier global-flip window
      // this attempt passed through.
      expect(state.peaks.peakValues.reportsServedWhileInconsistentCount as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Second unsafe path: premature legacy-path decommission", () => {
    it("decommissioning v1 early is unsafe even with every other control otherwise defaulted", () => {
      const baselineState = runScenario(SUSTAINED_UNDECIDED_MS + 10_000);
      const decommissionedState = runScenario(SUSTAINED_UNDECIDED_MS + 10_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: LEGACY_PATH_DECOMMISSION_KEY, value: "decommission-v1" },
      ]);
      expect(decommissionedState.transitions.incidentState).toBe("premature-decommission-trap");
      expect(decommissionedState.values.metricsWithMixedLineagePercent as number).toBeGreaterThan(0);
      expect(decommissionedState.values.lineageConsistencyStatus).toBe("inconsistent-silent");
      // Availability looks just as good as baseline.
      expect(decommissionedState.values.sourcesAvailabilityPercent).toBe(
        baselineState.values.sourcesAvailabilityPercent,
      );
      const eligibility = evaluateCompletionEligibility(
        dataLineageBreakDuringEtlMigrationSimulation,
        decommissionedState,
      );
      expect(eligibility).toEqual({ eligible: false });
    });

    it("premature-decommission trap is independent of (reachable even on top of) a staged migration", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 10_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "staged-per-source" },
        { atMs: MIGRATION_ONSET_MS + 2_000, controlKey: LEGACY_PATH_DECOMMISSION_KEY, value: "decommission-v1" },
      ]);
      expect(state.transitions.incidentState).toBe("premature-decommission-trap");
      expect(state.values.metricsWithMixedLineagePercent as number).toBeGreaterThan(0);
    });
  });

  describe("Alternate strong path A: staged-per-source cutover", () => {
    it("staged cutover protects lineage consistency immediately, no blend ever exists", () => {
      const state = runScenario(CUTOVER_WINDOW_1_MS + 35_000, STAGED_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("staged-window1");
      expect(state.values.metricsWithMixedLineagePercent).toBe(0);
      expect(state.values.lineageConsistencyStatus).toBe("consistent");
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("staged cutover never touches sourcesAvailabilityPercent/warehouseWriteSuccessRate structurally", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 5_000, STAGED_ONLY_ACTIONS);
      expect(state.values.sourcesAvailabilityPercent).toBe(100);
      expect(state.values.warehouseWriteSuccessRate).toBe(100);
    });

    it("only after the full cutover window does the staged path reach genuine OPTIMAL", () => {
      const state = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, STAGED_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("staged-fully-complete");
      expect(state.values.migrationStatus).toBe("complete");
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Alternate strong path B: dual-write-reconcile cutover", () => {
    it("dual-write-reconcile protects lineage consistency immediately, no blend ever exists", () => {
      const state = runScenario(CUTOVER_WINDOW_1_MS + 35_000, DUAL_WRITE_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("dual-write-window1");
      expect(state.values.metricsWithMixedLineagePercent).toBe(0);
      expect(state.values.lineageConsistencyStatus).toBe("consistent");
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("full reconciliation depth and shallow depth both reach OPTIMAL once fully complete, at different cost", () => {
      const shallowState = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, DUAL_WRITE_ONLY_ACTIONS);
      const fullState = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, DUAL_WRITE_FULL_DEPTH_ACTIONS);
      expect(shallowState.transitions.incidentState).toBe("dual-write-fully-complete-shallow-depth");
      expect(fullState.transitions.incidentState).toBe("dual-write-fully-complete-full-depth");
      const shallowEligibility = evaluateCompletionEligibility(
        dataLineageBreakDuringEtlMigrationSimulation,
        shallowState,
      );
      const fullEligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, fullState);
      expect(shallowEligibility).toEqual({ eligible: true, tier: "optimal" });
      expect(fullEligibility).toEqual({ eligible: true, tier: "optimal" });
      // Real, honest cost distinction: full reconciliation depth costs
      // strictly more than shallow for the same strategy.
      expect(fullState.cost.currentMonthlyCostUsd).toBeGreaterThan(shallowState.cost.currentMonthlyCostUsd);
    });

    it("dual-write-reconcile never touches sourcesAvailabilityPercent structurally", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 5_000, DUAL_WRITE_ONLY_ACTIONS);
      expect(state.values.sourcesAvailabilityPercent).toBe(100);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // DEFAULT-VALUE PATH COMPLETENESS — permanent regression tests. Every
  // safe strategy below is exercised with ONLY the control its own
  // description requires touched; every other control is left at its
  // UNTOUCHED DEFAULT value. Each must reach a genuinely safe terminal
  // state once the relevant elapsed-time window passes — never a
  // fallthrough to baseline/unsafe purely from elapsed time.
  // ══════════════════════════════════════════════════════════════════
  describe("Default-value path completeness", () => {
    it("staged-per-source ALONE (every other control at default) reaches full OPTIMAL after the full cutover window, not a baseline fallthrough", () => {
      const state = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, STAGED_ONLY_ACTIONS);
      expect(state.controlValues[LINEAGE_FLAGGING_KEY]).toBe(false);
      expect(state.controlValues[CUTOVER_AUDIT_LOG_KEY]).toBe(false);
      expect(state.controlValues[REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY]).toBe(false);
      expect(state.controlValues[LEGACY_PATH_DECOMMISSION_KEY]).toBe("keep-both");
      expect(state.transitions.incidentState).toBe("staged-fully-complete");
      expect(state.values.lineageConsistencyStatus).toBe("consistent");
      expect(state.values.migrationStatus).toBe("complete");
      expect(state.values.metricsWithMixedLineagePercent).toBe(0);
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("staged-per-source ALONE at cutover window 2 (not yet fully complete, every other control at default) reaches ACCEPTABLE, not a baseline fallthrough", () => {
      const state = runScenario(CUTOVER_WINDOW_2_MS + 5_000, STAGED_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("staged-window2");
      expect(state.values.lineageConsistencyStatus).toBe("consistent");
      expect(state.values.metricsWithMixedLineagePercent).toBe(0);
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("dual-write-reconcile ALONE (reconciliationDepth left at default 'shallow', every other control at default) reaches full OPTIMAL after the full cutover window, not a baseline fallthrough", () => {
      const state = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, DUAL_WRITE_ONLY_ACTIONS);
      expect(state.controlValues[RECONCILIATION_DEPTH_KEY]).toBe("shallow");
      expect(state.controlValues[LINEAGE_FLAGGING_KEY]).toBe(false);
      expect(state.controlValues[CUTOVER_AUDIT_LOG_KEY]).toBe(false);
      expect(state.controlValues[REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY]).toBe(false);
      expect(state.controlValues[LEGACY_PATH_DECOMMISSION_KEY]).toBe("keep-both");
      expect(state.transitions.incidentState).toBe("dual-write-fully-complete-shallow-depth");
      expect(state.values.lineageConsistencyStatus).toBe("consistent");
      expect(state.values.migrationStatus).toBe("complete");
      expect(state.values.metricsWithMixedLineagePercent).toBe(0);
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("dual-write-reconcile ALONE at cutover window 1 (not yet fully complete, reconciliationDepth at default) reaches ACCEPTABLE, not a baseline fallthrough", () => {
      const state = runScenario(CUTOVER_WINDOW_1_MS + 5_000, DUAL_WRITE_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("dual-write-window1");
      expect(state.values.lineageConsistencyStatus).toBe("consistent");
      expect(state.values.metricsWithMixedLineagePercent).toBe(0);
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("staged-per-source just-engaged (tick zero, every other control at default) reaches ACCEPTABLE-eligible as soon as the 30s sustain window passes, not a baseline fallthrough", () => {
      const justEngaged = runScenario(SUSTAINED_UNDECIDED_MS + 4_000, [
        { atMs: SUSTAINED_UNDECIDED_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "staged-per-source" },
      ]);
      expect(justEngaged.transitions.incidentState).toBe("staged-just-engaged");
      expect(justEngaged.values.lineageConsistencyStatus).toBe("consistent");
      expect(justEngaged.values.migrationStatus).toBe("in-progress-safe");

      const sustained = runScenario(SUSTAINED_UNDECIDED_MS + 32_000, [
        { atMs: SUSTAINED_UNDECIDED_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "staged-per-source" },
      ]);
      // Still well before cutoverWindow1Elapsed (2 minutes later) —
      // this is the SAME just-engaged state, merely sustained for its
      // own 30s acceptable-condition window, never the window-1 state.
      expect(sustained.transitions.incidentState).toBe("staged-just-engaged");
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, sustained);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("dual-write-reconcile just-engaged (tick zero, every other control at default) reaches ACCEPTABLE-eligible as soon as the 30s sustain window passes, not a baseline fallthrough", () => {
      const justEngaged = runScenario(SUSTAINED_UNDECIDED_MS + 4_000, [
        { atMs: SUSTAINED_UNDECIDED_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "dual-write-reconcile" },
      ]);
      expect(justEngaged.transitions.incidentState).toBe("dual-write-just-engaged");
      expect(justEngaged.values.lineageConsistencyStatus).toBe("consistent");
      expect(justEngaged.values.migrationStatus).toBe("in-progress-safe");

      const sustained = runScenario(SUSTAINED_UNDECIDED_MS + 32_000, [
        { atMs: SUSTAINED_UNDECIDED_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "dual-write-reconcile" },
      ]);
      expect(sustained.transitions.incidentState).toBe("dual-write-just-engaged");
      const eligibility = evaluateCompletionEligibility(dataLineageBreakDuringEtlMigrationSimulation, sustained);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("a zero-action Finish issued well after sustained-undecided still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued immediately at incident start also resolves to declared_unstable", () => {
      const state = runScenario(MIGRATION_ONSET_MS + 1_000);
      const result = evaluateCandidateDeclaredFinish(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("declared_unstable still wins in candidate_declared mode even though the attempt itself never auto-fails", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 15 * 60_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      const result = evaluateCandidateDeclaredFinish(dataLineageBreakDuringEtlMigrationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
    });
  });

  describe("Scoring", () => {
    it("optimal path (staged-per-source, fully complete) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, STAGED_ONLY_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(dataLineageBreakDuringEtlMigrationSimulation, state);
      const inputs = extractFinishScoringInputs(dataLineageBreakDuringEtlMigrationSimulation, result);
      const score = scoreAuthoredAttempt(DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL (staged-per-source) SCORE", JSON.stringify(score));
    });

    it("optimal path (dual-write-reconcile, full depth) scores near-maximum but at a real, higher cost than staged", () => {
      const stagedState = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, STAGED_ONLY_ACTIONS);
      const dualWriteState = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, DUAL_WRITE_FULL_DEPTH_ACTIONS);
      const stagedResult = evaluateCandidateDeclaredFinish(dataLineageBreakDuringEtlMigrationSimulation, stagedState);
      const dualWriteResult = evaluateCandidateDeclaredFinish(
        dataLineageBreakDuringEtlMigrationSimulation,
        dualWriteState,
      );
      const stagedScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        extractFinishScoringInputs(dataLineageBreakDuringEtlMigrationSimulation, stagedResult),
      );
      const dualWriteScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        extractFinishScoringInputs(dataLineageBreakDuringEtlMigrationSimulation, dualWriteResult),
      );
      expect(dualWriteResult.completionTier).toBe("optimal");
      expect(stagedResult.completionTier).toBe("optimal");
      // Both reach OPTIMAL, but dual-write-reconcile's real ongoing
      // dual-compute cost makes it score lower on costEfficiency than
      // staged-per-source's lighter coordination cost — a genuine,
      // honest tradeoff difference between two equally-safe paths.
      expect(dualWriteScore.breakdown.costEfficiency).toBeLessThan(stagedScore.breakdown.costEfficiency);
      console.log("OPTIMAL (dual-write-reconcile, full depth) SCORE", JSON.stringify(dualWriteScore));
      console.log("OPTIMAL (staged-per-source) SCORE (for comparison)", JSON.stringify(stagedScore));
    });

    it("acceptable path (staged, still cutting over) scores well but below optimal", () => {
      const optimalState = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, STAGED_ONLY_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(dataLineageBreakDuringEtlMigrationSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        extractFinishScoringInputs(dataLineageBreakDuringEtlMigrationSimulation, optimalResult),
      );

      const acceptableState = runScenario(CUTOVER_WINDOW_1_MS + 35_000, STAGED_ONLY_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        dataLineageBreakDuringEtlMigrationSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        extractFinishScoringInputs(dataLineageBreakDuringEtlMigrationSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE (staged-window1) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    // Regression coverage for phase-6e3-scoring-closeout.md: OPTIMAL
    // dual-write-reconcile (full depth) genuinely scores 10 points BELOW
    // ACCEPTABLE staged-window1. This is intentional (Option D):
    // dual-write-full-depth reaches a STRICTLY STRONGER end-state
    // (sourcesInInconsistentStateCount: 0 of 12, full reconciliation)
    // than staged-window1 (sourcesInInconsistentStateCount: 1, only 5 of
    // 12 sources cut over, migrationStatus "in-progress-safe") — so
    // dataIntegrity (200 vs 170) correctly favors dual-write. The net
    // -10 comes entirely from a real, legitimate ongoing operational
    // cost: reconciliationDepth="full" carries a genuine +$260/mo
    // infrastructure cost (revenue-and-cost.ts), so costEfficiency (45
    // vs 85) is honestly worse for dual-write-full-depth — reflecting
    // the real price of running full dual-compute reconciliation versus
    // a still-incomplete staged migration. This test exists so a future
    // edit cannot silently change dual-write-full-depth's OPTIMAL tier
    // or erase this exact, deliberate dimension structure.
    it("REGRESSION: OPTIMAL dual-write-reconcile (full depth) genuinely scores below ACCEPTABLE staged-window1, for named, legitimate reasons — tier/score divergence is intentional (Option D)", () => {
      const dualWriteState = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, DUAL_WRITE_FULL_DEPTH_ACTIONS);
      const dualWriteResult = evaluateCandidateDeclaredFinish(
        dataLineageBreakDuringEtlMigrationSimulation,
        dualWriteState,
      );
      const dualWriteScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        extractFinishScoringInputs(dataLineageBreakDuringEtlMigrationSimulation, dualWriteResult),
      );

      const acceptableState = runScenario(CUTOVER_WINDOW_1_MS + 35_000, STAGED_ONLY_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        dataLineageBreakDuringEtlMigrationSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        extractFinishScoringInputs(dataLineageBreakDuringEtlMigrationSimulation, acceptableResult),
      );

      // Tiers: both real, correctly classified.
      expect(dualWriteResult.completionTier).toBe("optimal");
      expect(acceptableResult.completionTier).toBe("acceptable");

      // The divergence is real and reproducible.
      expect(dualWriteScore.total).toBeLessThan(acceptableScore.total);
      expect(dualWriteScore.total).toBe(945);
      expect(acceptableScore.total).toBe(955);

      // It is driven entirely by costEfficiency (the real, ongoing
      // dual-compute price) — never by a correctness regression.
      // dual-write-full-depth's dataIntegrity must be AT OR ABOVE the
      // still-in-progress staged path's.
      expect(dualWriteScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(
        acceptableScore.breakdown.dataIntegrity,
      );
      expect(dualWriteScore.breakdown.costEfficiency).toBeLessThan(acceptableScore.breakdown.costEfficiency);
      expect(dualWriteScore.breakdown.recovery).toBe(acceptableScore.breakdown.recovery);
      expect(dualWriteScore.breakdown.reliability).toBe(acceptableScore.breakdown.reliability);

      console.log(
        "DUAL-WRITE-FULL-DEPTH vs ACCEPTABLE (closeout regression)",
        JSON.stringify({ dualWriteScore, acceptableScore }),
      );
    });

    it("baseline (undecided, no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE (undecided) SCORE", JSON.stringify(score));
    });

    it("harmful path (silent global-flip) scores worse than baseline on dataIntegrity AND total, despite availability looking just as good", () => {
      const baselineState = runScenario(SUSTAINED_UNDECIDED_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_UNDECIDED_MS + 60_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.sourcesAvailabilityPercent).toBe(baselineState.values.sourcesAvailabilityPercent);
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (silent global-flip) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("unsafe-minimum-cost (silent global-flip, zero extra spend) cannot win overall against the safe-but-costlier dual-write-reconcile path", () => {
      const unsafeMinCostState = runScenario(SUSTAINED_UNDECIDED_MS + 60_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      const safeButCostlierState = runScenario(SUSTAINED_UNDECIDED_MS + 60_000, DUAL_WRITE_FULL_DEPTH_ACTIONS);
      const unsafeScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        buildScoringInputs(unsafeMinCostState),
      );
      const safeScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        buildScoringInputs(safeButCostlierState),
      );
      // The unsafe path spends LESS (no extra compute) ...
      expect(unsafeMinCostState.cost.currentMonthlyCostUsd).toBeLessThan(
        safeButCostlierState.cost.currentMonthlyCostUsd,
      );
      // ... yet still cannot win on total score.
      expect(unsafeScore.total).toBeLessThan(safeScore.total);
      console.log("UNSAFE MINIMUM-COST SCORE", JSON.stringify(unsafeScore));
      console.log("SAFE-BUT-COSTLIER SCORE (for comparison)", JSON.stringify(safeScore));
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // cutoverAuditLog is a real, modest, secondary lever — this directly
  // replaces a prior dead-control defect where cutoverAuditLog=true vs
  // false (or left at default) produced BYTE-IDENTICAL state.values at
  // every mid-migration elapsed time (cutoverAuditability was hardcoded
  // per-rule-id regardless of the control). It must now produce a
  // measurably different cutoverAuditability AND a measurably different
  // dataIntegrity/total score at the same elapsed time, while never
  // flipping which cutoverStrategy/reconciliationDepth choice is
  // optimal.
  // ══════════════════════════════════════════════════════════════════
  describe("cutoverAuditLog: a real, modest secondary lever (business invariant #2)", () => {
    it("cutoverAuditLog=true vs left at default false produces a DIFFERENT cutoverAuditability at the same mid-migration elapsed time (staged-per-source, window1)", () => {
      const withAuditLog = runScenario(CUTOVER_WINDOW_1_MS + 35_000, [
        ...STAGED_ONLY_ACTIONS,
        { atMs: SUSTAINED_UNDECIDED_MS + 2_000, controlKey: CUTOVER_AUDIT_LOG_KEY, value: true },
      ]);
      const withoutAuditLog = runScenario(CUTOVER_WINDOW_1_MS + 35_000, STAGED_ONLY_ACTIONS);

      expect(withAuditLog.transitions.incidentState).toBe("staged-window1");
      expect(withoutAuditLog.transitions.incidentState).toBe("staged-window1");
      expect(withAuditLog.values.cutoverAuditability).toBe("traceable");
      expect(withoutAuditLog.values.cutoverAuditability).toBe("opaque");
      // This is the exact empirical check the original defect reversed:
      // state.values must now be DIFFERENT between the two runs, not
      // byte-identical.
      expect(JSON.stringify(withAuditLog.values)).not.toBe(JSON.stringify(withoutAuditLog.values));
    });

    it("cutoverAuditLog=true vs false produces a DIFFERENT cutoverAuditability during dual-write-reconcile (window2) too", () => {
      const withAuditLog = runScenario(CUTOVER_WINDOW_2_MS + 5_000, [
        ...DUAL_WRITE_ONLY_ACTIONS,
        { atMs: SUSTAINED_UNDECIDED_MS + 2_000, controlKey: CUTOVER_AUDIT_LOG_KEY, value: true },
      ]);
      const withoutAuditLog = runScenario(CUTOVER_WINDOW_2_MS + 5_000, DUAL_WRITE_ONLY_ACTIONS);

      expect(withAuditLog.transitions.incidentState).toBe("dual-write-window2");
      expect(withoutAuditLog.transitions.incidentState).toBe("dual-write-window2");
      expect(withAuditLog.values.cutoverAuditability).toBe("traceable");
      expect(withoutAuditLog.values.cutoverAuditability).toBe("opaque");
    });

    it("cutoverAuditLog=true scores strictly higher on dataIntegrity (and total) than leaving it at default false, at the identical mid-migration elapsed time", () => {
      const withAuditLogState = runScenario(CUTOVER_WINDOW_1_MS + 35_000, [
        ...STAGED_ONLY_ACTIONS,
        { atMs: SUSTAINED_UNDECIDED_MS + 2_000, controlKey: CUTOVER_AUDIT_LOG_KEY, value: true },
      ]);
      const withoutAuditLogState = runScenario(CUTOVER_WINDOW_1_MS + 35_000, STAGED_ONLY_ACTIONS);

      const withAuditLogScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        buildScoringInputs(withAuditLogState),
      );
      const withoutAuditLogScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        buildScoringInputs(withoutAuditLogState),
      );

      // Exact before/after dataIntegrity numbers: 200 (full credit) -
      // 20 (in-progress-safe, not yet complete) = 180 with audit
      // logging on; 180 - 10 (secondary cutoverAuditability === "opaque"
      // penalty) = 170 with it left off.
      expect(withAuditLogScore.breakdown.dataIntegrity).toBe(180);
      expect(withoutAuditLogScore.breakdown.dataIntegrity).toBe(170);
      expect(withAuditLogScore.breakdown.dataIntegrity).toBeGreaterThan(
        withoutAuditLogScore.breakdown.dataIntegrity,
      );
      expect(withAuditLogScore.total).toBeGreaterThan(withoutAuditLogScore.total);
      expect(withAuditLogScore.total - withoutAuditLogScore.total).toBe(10);
    });

    it("cutoverAuditLog is a modest secondary lever: it never changes which cutoverStrategy choice is OPTIMAL-tier, nor flips staged-vs-dual-write cost ordering", () => {
      const stagedWithAuditLog = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, [
        ...STAGED_ONLY_ACTIONS,
        { atMs: SUSTAINED_UNDECIDED_MS + 2_000, controlKey: CUTOVER_AUDIT_LOG_KEY, value: true },
      ]);
      const stagedWithoutAuditLog = runScenario(CUTOVER_FULLY_COMPLETE_MS + 35_000, STAGED_ONLY_ACTIONS);

      // Both reach the SAME fully-complete rule state (cutoverAuditLog
      // has no effect once migrationStatus === "complete" — that state
      // already hardcodes cutoverAuditability: "traceable" regardless of
      // the control, since the final doubled-checked audit trail is part
      // of what "complete" means in this scenario).
      expect(stagedWithAuditLog.transitions.incidentState).toBe("staged-fully-complete");
      expect(stagedWithoutAuditLog.transitions.incidentState).toBe("staged-fully-complete");

      const withEligibility = evaluateCompletionEligibility(
        dataLineageBreakDuringEtlMigrationSimulation,
        stagedWithAuditLog,
      );
      const withoutEligibility = evaluateCompletionEligibility(
        dataLineageBreakDuringEtlMigrationSimulation,
        stagedWithoutAuditLog,
      );
      expect(withEligibility).toEqual({ eligible: true, tier: "optimal" });
      expect(withoutEligibility).toEqual({ eligible: true, tier: "optimal" });

      // And the 10pt secondary lever is small enough that staged-per-
      // source mid-migration WITHOUT audit logging still beats
      // dual-write-reconcile's real ongoing dual-compute cost on total
      // score — the primary cutoverStrategy-vs-reconciliationDepth
      // judgment this scenario centers on is never overwhelmed by this
      // accelerant.
      const stagedWindow1NoAuditLog = runScenario(CUTOVER_WINDOW_1_MS + 35_000, STAGED_ONLY_ACTIONS);
      const dualWriteFullDepthWindow1 = runScenario(CUTOVER_WINDOW_1_MS + 35_000, DUAL_WRITE_FULL_DEPTH_ACTIONS);
      const stagedScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        buildScoringInputs(stagedWindow1NoAuditLog),
      );
      const dualWriteScore = scoreAuthoredAttempt(
        DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
        buildScoringInputs(dualWriteFullDepthWindow1),
      );
      expect(stagedScore.total).toBeGreaterThan(dualWriteScore.total);
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(CUTOVER_WINDOW_1_MS + 5_000, STAGED_ONLY_ACTIONS);
      const runB = runScenario(CUTOVER_WINDOW_1_MS + 5_000, STAGED_ONLY_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak mixed-lineage rate and cumulative reports-served-while-inconsistent count generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_UNDECIDED_MS + 10_000, [
        { atMs: MIGRATION_ONSET_MS + 1_000, controlKey: CUTOVER_STRATEGY_KEY, value: "global-flip" },
      ]);
      expect(state.peaks.peakValues.metricsWithMixedLineagePercent).toBeGreaterThan(0);
      expect(state.peaks.peakValues.reportsServedWhileInconsistentCount).toBeGreaterThan(0);
    });
  });
});
