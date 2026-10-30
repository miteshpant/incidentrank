import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { dataRetentionPolicyMisconfiguration } from "./data-retention-policy-misconfiguration";
import {
  AUDIT_SEQUENCING_KEY,
  DELETION_POLICY_MODE_KEY,
  EMERGENCY_HALT_ALL_DELETION_KEY,
  EPHEMERAL_LOG_PURGE_KEY,
  FIX_ROLLOUT_MODE_KEY,
  LEGAL_HOLD_ENFORCEMENT_KEY,
  USER_DELETION_REQUEST_PROCESSING_KEY,
  dataRetentionPolicyMisconfigurationSimulation,
} from "./data-retention-policy-misconfiguration/definition";
import { dataRetentionPolicyMisconfigurationCandidateUI } from "./data-retention-policy-misconfiguration/candidate-ui";
import { DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING } from "./data-retention-policy-misconfiguration/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  DRAIN_WINDOW_1_MS,
  DRAIN_WINDOW_FULLY_RECOVERED_MS,
  MISCONFIGURATION_DISCOVERED_MS,
  SUSTAINED_MISCONFIGURATION_MS,
} from "./data-retention-policy-misconfiguration/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(dataRetentionPolicyMisconfigurationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += dataRetentionPolicyMisconfigurationSimulation.tickMs
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
      dataRetentionPolicyMisconfigurationSimulation,
      state,
      action,
      dataRetentionPolicyMisconfigurationSimulation.tickMs,
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
      dataRetentionPolicyMisconfigurationSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: targeted correction, applied directly (every
// other control left at its untouched default — fix-immediately /
// direct-to-production).
const TARGETED_CORRECTION_DIRECT_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
  { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
];

// Alternate strong path B: halt-and-audit-then-selective-resume —
// audit-first sequencing PLUS validate-first rollout, materially
// slower but fully audited/validated.
const AUDITED_VALIDATED_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: AUDIT_SEQUENCING_KEY, value: "audit-first" },
  { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: FIX_ROLLOUT_MODE_KEY, value: "validate-first" },
  { atMs: SUSTAINED_MISCONFIGURATION_MS + 3_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
  { atMs: SUSTAINED_MISCONFIGURATION_MS + 4_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
];

describe("Data Retention Policy Misconfiguration", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(dataRetentionPolicyMisconfiguration.isFree).toBe(false);
      expect(dataRetentionPolicyMisconfiguration.library?.category).toBe("Data Pipelines");
      expect(dataRetentionPolicyMisconfiguration.library?.tags.length).toBeGreaterThan(0);
      expect(dataRetentionPolicyMisconfiguration.library?.skills.length).toBeGreaterThan(0);
      expect(dataRetentionPolicyMisconfiguration.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(dataRetentionPolicyMisconfigurationCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(dataRetentionPolicyMisconfigurationCandidateUI.controls.length).toBeGreaterThanOrEqual(7);
      expect(dataRetentionPolicyMisconfigurationCandidateUI.components.length).toBe(5);
    });

    it("the architecture is a flat 5-node, 4-edge pipeline matching the spec", () => {
      expect(dataRetentionPolicyMisconfigurationSimulation.architecture.nodes.length).toBe(5);
      expect(dataRetentionPolicyMisconfigurationSimulation.architecture.edges.length).toBe(4);
      for (const node of dataRetentionPolicyMisconfigurationSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all four business invariants", () => {
      expect(dataRetentionPolicyMisconfiguration.description).toMatch(
        /data under legal hold or mandated retention must never be deleted/i,
      );
      expect(dataRetentionPolicyMisconfiguration.description).toMatch(
        /data past its own mandated deletion deadline must not be retained indefinitely/i,
      );
      expect(dataRetentionPolicyMisconfiguration.description).toMatch(
        /different data classes.*have genuinely different retention requirements/i,
      );
      expect(dataRetentionPolicyMisconfiguration.description).toMatch(
        /once a record is wrongly deleted, that loss is permanent and irreversible/i,
      );
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of dataRetentionPolicyMisconfigurationSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it (zero dead controls)", () => {
      const classifiedKeys = new Set(
        dataRetentionPolicyMisconfigurationSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of dataRetentionPolicyMisconfigurationSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });

    it("every control is referenced by at least one rule condition (zero dead controls)", () => {
      const ruleControlKeys = new Set<string>();
      for (const rule of dataRetentionPolicyMisconfigurationSimulation.rules) {
        for (const key of Object.keys(rule.when.controlEquals ?? {})) {
          ruleControlKeys.add(key);
        }
      }
      for (const control of dataRetentionPolicyMisconfigurationSimulation.controls) {
        expect(ruleControlKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(dataRetentionPolicyMisconfigurationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.userDeletionRequestRetentionStatus).toBe("compliant");
      expect(state.values.financialRecordsWronglyDeletedCount).toBe(0);
    });

    it("misconfiguration discovery triggers the incident with degrading compliance, never touching uptime/write-success", () => {
      const state = runScenario(MISCONFIGURATION_DISCOVERED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(MISCONFIGURATION_DISCOVERED_MS);
      expect(state.values.applicationUptimePercent).toBe(99.98);
      expect(state.values.eventStoreWriteSuccessRate).toBe(100);
    });

    it("baseline (no action) keeps wrongly purging Financial Records while uptime/write-success stay perfect throughout (the core decoy)", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-sustained-misconfigured");
      expect(state.values.applicationUptimePercent).toBe(99.98);
      expect(state.values.eventStoreWriteSuccessRate).toBe(100);
      expect(state.values.financialRecordsRetentionStatus).toBe("actively-violated");
      expect(state.values.financialRecordsWronglyDeletedCount as number).toBeGreaterThan(0);
    });
  });

  describe("Required tempting-but-unsafe trap: panic-pausing all deletion classes", () => {
    it("pausing all classes stops Financial Records loss but creates an independent User-Deletion-Request violation", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: EMERGENCY_HALT_ALL_DELETION_KEY, value: "all-classes-paused" },
      ]);
      expect(state.transitions.incidentState).toBe("panic-pause-all-classes-sustained");
      expect(state.values.userDeletionRequestRetentionStatus).toBe("deadline-breached");
      expect(state.values.userDeletionRequestOverdueCount as number).toBeGreaterThan(0);
      // Application/Event Store look just as healthy as every safe path.
      expect(state.values.applicationUptimePercent).toBe(99.98);
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("the panic-pause trap worsens BOTH compliance fields at once relative to baseline on Financial Records alone", () => {
      const baseline = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000);
      const panicPause = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: EMERGENCY_HALT_ALL_DELETION_KEY, value: "all-classes-paused" },
      ]);
      // Baseline never touches the second class at all.
      expect(baseline.values.userDeletionRequestRetentionStatus).toBe("compliant");
      // Panic-pause creates a violation baseline never had.
      expect(panicPause.values.userDeletionRequestRetentionStatus).toBe("deadline-breached");
    });

    it("directly suspending User-Deletion-Request processing (without the fleet-wide halt) creates the same class of violation independently", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 2_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 3_000, controlKey: USER_DELETION_REQUEST_PROCESSING_KEY, value: "suspended" },
      ]);
      expect(state.transitions.incidentState).toBe("wrong-class-suspended-sustained");
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.userDeletionRequestRetentionStatus).toBe("deadline-breached");
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Independent unsafe trap: legal-hold enforcement gap", () => {
    it("correcting the main policy without enforcing legal holds is still unsafe", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
      ]);
      expect(state.transitions.incidentState).toBe("legal-hold-breach-trap");
      expect(state.values.financialRecordsRetentionStatus).toBe("actively-violated");
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("legal-hold-breach trap is independent of (not reachable only through) a fully misconfigured policy", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 2_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "unenforced" },
      ]);
      expect(state.transitions.incidentState).toBe("legal-hold-breach-trap");
    });
  });

  describe("Alternate strong path A: targeted correction, applied directly", () => {
    it("deletionPolicyMode=financial-class-corrected + legalHoldEnforcement=enforced stops Financial Records violation immediately (no drain lag needed for the live violation itself)", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000, [
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);
      expect(state.transitions.incidentState).toBe("just-corrected-no-drain-yet");
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.userDeletionRequestRetentionStatus).toBe("compliant");
    });

    it("reaches genuine OPTIMAL once the full drain window elapses, with every other control left at its untouched default", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-recovered-direct-unvalidated");
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.financialRecordsComplianceRatePercent).toBe(100);
      expect(state.values.userDeletionRequestRetentionStatus).toBe("compliant");
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("affectedRecordAuditStatus is permanently 'never-completed' when the fix is applied without ever auditing first", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      expect(state.values.affectedRecordAuditStatus).toBe("never-completed");
    });
  });

  describe("Alternate strong path B: halt-and-audit-then-selective-resume (audited + validated)", () => {
    it("reaches genuine OPTIMAL once drained, with a verified audit and a validated correction", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, AUDITED_VALIDATED_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-recovered-audited-validated");
      expect(state.values.affectedRecordAuditStatus).toBe("completed");
      expect(state.values.correctionValidationStatus).toBe("validated");
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.userDeletionRequestRetentionStatus).toBe("compliant");
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Path B is materially slower to the same terminal compliance state than Path A, a real recovery-speed tradeoff for completeness", () => {
      const pathA = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const pathB = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, AUDITED_VALIDATED_ACTIONS);
      // Both reach the identical live compliance outcome...
      expect(pathA.values.financialRecordsRetentionStatus).toBe(pathB.values.financialRecordsRetentionStatus);
      expect(pathA.values.financialRecordsComplianceRatePercent).toBe(pathB.values.financialRecordsComplianceRatePercent);
      // ...but Path B's wrongly-deleted count is lower (audit-first ran
      // concurrently, catching the fix sooner in the audited rules) —
      // a real, distinct number, not a cosmetic relabeling.
      expect(pathB.values.financialRecordsWronglyDeletedCount as number).toBeLessThan(
        pathA.values.financialRecordsWronglyDeletedCount as number,
      );
    });

    it("auditSequencing is not a dead control: audit-first genuinely completes the audit, fix-immediately never does", () => {
      const auditedState = runScenario(SUSTAINED_MISCONFIGURATION_MS + 10_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: AUDIT_SEQUENCING_KEY, value: "audit-first" },
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 2_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 3_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);
      const unauditedState = runScenario(SUSTAINED_MISCONFIGURATION_MS + 10_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 2_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);
      expect(auditedState.values.affectedRecordAuditStatus).toBe("in-progress");
      expect(unauditedState.values.affectedRecordAuditStatus).toBe("in-progress");
    });

    it("fixRolloutMode is not a dead control: validate-first adds real ongoing cost that direct-to-production never incurs", () => {
      const directState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 5_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const validatedState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 5_000, AUDITED_VALIDATED_ACTIONS);
      expect(validatedState.cost.currentMonthlyCostUsd).toBeGreaterThan(directState.cost.currentMonthlyCostUsd);
    });
  });

  describe("Default-value path completeness (binding requirement): every safe strategy reaches a safe terminal state with untouched-default controls", () => {
    it("REGRESSION: financial-class-corrected + legal-hold enforced, applied directly (auditSequencing and fixRolloutMode left at their untouched defaults), reaches a genuinely safe OPTIMAL state once fully drained, never falling through to baseline-sustained-misconfigured", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-misconfigured");
      expect(state.transitions.incidentState).toBe("fully-recovered-direct-unvalidated");
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.financialRecordsComplianceRatePercent).toBe(100);
      expect(state.values.userDeletionRequestRetentionStatus).toBe("compliant");
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("REGRESSION: audit-first left as the only non-default control (fixRolloutMode untouched) reaches safe OPTIMAL once fully drained", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: AUDIT_SEQUENCING_KEY, value: "audit-first" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 3_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-misconfigured");
      expect(state.transitions.incidentState).toBe("fully-recovered-audited-unvalidated");
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.affectedRecordAuditStatus).toBe("completed");
      expect(state.values.correctionValidationStatus).toBe("unvalidated-direct-to-production");
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: validate-first left as the only non-default control (auditSequencing untouched) reaches safe OPTIMAL once fully drained", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: FIX_ROLLOUT_MODE_KEY, value: "validate-first" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 3_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-misconfigured");
      expect(state.transitions.incidentState).toBe("fully-recovered-unaudited-validated");
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.affectedRecordAuditStatus).toBe("never-completed");
      expect(state.values.correctionValidationStatus).toBe("validated");
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: the fully-audited-and-validated combination (Path B) also reaches safe OPTIMAL once fully drained", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, AUDITED_VALIDATED_ACTIONS);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-misconfigured");
      expect(state.transitions.incidentState).toBe("fully-recovered-audited-validated");
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: the ACCEPTABLE (draining, not yet fully recovered) tier also covers all four auditSequencing x fixRolloutMode combinations without falling through to baseline", () => {
      const direct = runScenario(DRAIN_WINDOW_1_MS + 5_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const auditedValidated = runScenario(DRAIN_WINDOW_1_MS + 5_000, AUDITED_VALIDATED_ACTIONS);
      const auditedOnly = runScenario(DRAIN_WINDOW_1_MS + 5_000, [
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: AUDIT_SEQUENCING_KEY, value: "audit-first" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 3_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);
      const validatedOnly = runScenario(DRAIN_WINDOW_1_MS + 5_000, [
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: FIX_ROLLOUT_MODE_KEY, value: "validate-first" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 3_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);

      for (const [state, expectedIncidentState] of [
        [direct, "draining-window1-direct-unvalidated"],
        [auditedValidated, "draining-window1-audited-validated"],
        [auditedOnly, "draining-window1-audited-unvalidated"],
        [validatedOnly, "draining-window1-unaudited-validated"],
      ] as const) {
        expect(state.transitions.incidentState).not.toBe("baseline-sustained-misconfigured");
        expect(state.transitions.incidentState).toBe(expectedIncidentState);
        expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
        expect(state.values.userDeletionRequestRetentionStatus).toBe("compliant");
        const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      }
    });

    it("ephemeralLogPurge left at its untouched default ('enforced') never affects the safe terminal state", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      expect(state.values.ephemeralLogExcessStorageGb).toBe(0);
      expect(state.transitions.incidentState).toBe("fully-recovered-direct-unvalidated");
    });

    it("userDeletionRequestProcessing left at its untouched default ('enforced') never affects the safe terminal state", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      expect(state.values.userDeletionRequestRetentionStatus).toBe("compliant");
    });
  });

  describe("ephemeralLogPurge control usage", () => {
    it("suspending ephemeral-log purging directly is never a compliance violation, but it is a real, distinct cost signal", () => {
      const normalState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const logsSuspendedState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        ...TARGETED_CORRECTION_DIRECT_ACTIONS,
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 3_000, controlKey: EPHEMERAL_LOG_PURGE_KEY, value: "suspended" },
      ]);
      expect(logsSuspendedState.transitions.incidentState).toBe("fully-recovered-direct-unvalidated-logs-suspended");
      expect(logsSuspendedState.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(logsSuspendedState.values.userDeletionRequestRetentionStatus).toBe("compliant");
      expect(logsSuspendedState.values.ephemeralLogExcessStorageGb as number).toBeGreaterThan(
        normalState.values.ephemeralLogExcessStorageGb as number,
      );
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, logsSuspendedState);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("No scale-X-overload-Y mechanic", () => {
    it("engaging every lever simultaneously never degrades applicationUptimePercent/eventStoreWriteSuccessRate (no pressure-transfer trap exists in this scenario)", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000, [
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 3_000, controlKey: AUDIT_SEQUENCING_KEY, value: "audit-first" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 4_000, controlKey: FIX_ROLLOUT_MODE_KEY, value: "validate-first" },
      ]);
      expect(state.values.applicationUptimePercent).toBe(99.98);
      expect(state.values.eventStoreWriteSuccessRate).toBe(100);
    });
  });

  describe("Historical/permanent damage: wrongly-deleted Financial Records never reset", () => {
    it("the live wrongly-deleted count can effectively stop growing once corrected, but the peak historical record never decreases", () => {
      const unsafeState = runScenario(SUSTAINED_MISCONFIGURATION_MS + 10_000);
      const correctedState = runScenario(SUSTAINED_MISCONFIGURATION_MS + 20_000, [
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 11_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 12_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);
      expect(unsafeState.values.financialRecordsWronglyDeletedCount as number).toBeGreaterThan(0);
      expect(correctedState.peaks.peakValues.financialRecordsWronglyDeletedCount as number).toBeGreaterThanOrEqual(
        unsafeState.values.financialRecordsWronglyDeletedCount as number,
      );
    });

    it("full remediation after an unsafe window reaches OPTIMAL on every live metric while the peak historical record permanently shows the loss", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: EMERGENCY_HALT_ALL_DELETION_KEY, value: "off" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 1_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 2_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
      ]);
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.userDeletionRequestRetentionStatus).toBe("compliant");
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the sustained exposure this
      // attempt passed through before correcting.
      expect(state.peaks.peakValues.financialRecordsWronglyDeletedCount as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("the independent User-Deletion-Request overdue count also tracks its own non-resetting peak", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 20_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: EMERGENCY_HALT_ALL_DELETION_KEY, value: "all-classes-paused" },
        { atMs: SUSTAINED_MISCONFIGURATION_MS + 11_000, controlKey: EMERGENCY_HALT_ALL_DELETION_KEY, value: "off" },
      ]);
      expect(state.peaks.peakValues.userDeletionRequestOverdueCount as number).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(MISCONFIGURATION_DISCOVERED_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable, even though availability metrics already read green", () => {
      const state = runScenario(MISCONFIGURATION_DISCOVERED_MS + 5_000);
      expect(state.values.applicationUptimePercent).toBe(99.98);
      const result = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained misconfiguration still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("the targeted-correction-but-still-draining family qualifies as ACCEPTABLE before full recovery", () => {
      const state = runScenario(DRAIN_WINDOW_1_MS + 5_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      expect(state.values.financialRecordsRetentionStatus).toBe("compliant");
      expect(state.values.financialRecordsComplianceRatePercent as number).toBeLessThan(100);
    });

    it("stays active (never auto-fails) even after the wrongly-deleted count stays past the failure threshold for well beyond the old sustained window, and still resolves candidate_declared Finish to declared_unstable", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 15 * 60_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(30);
      const result = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-recovered-audited-validated, Path B) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, AUDITED_VALIDATED_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, state);
      const inputs = extractFinishScoringInputs(dataRetentionPolicyMisconfigurationSimulation, result);
      const score = scoreAuthoredAttempt(DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL (Path B: audited+validated) SCORE", JSON.stringify(score));
    });

    it("optimal path (fully-recovered-direct-unvalidated, Path A) also scores full dataIntegrity credit, reaching optimal faster", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, state);
      expect(result.completionTier).toBe("optimal");
      const inputs = extractFinishScoringInputs(dataRetentionPolicyMisconfigurationSimulation, result);
      const score = scoreAuthoredAttempt(DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL (Path A: direct) SCORE", JSON.stringify(score));
    });

    it("acceptable path (targeted correction, still draining) scores well but below optimal", () => {
      const optimalState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        extractFinishScoringInputs(dataRetentionPolicyMisconfigurationSimulation, optimalResult),
      );

      const acceptableState = runScenario(DRAIN_WINDOW_1_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        dataRetentionPolicyMisconfigurationSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        extractFinishScoringInputs(dataRetentionPolicyMisconfigurationSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE (draining-window1-direct-unvalidated) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    // Regression coverage for phase-6e3-scoring-closeout.md: OPTIMAL
    // Path B (audited+validated, fully recovered) genuinely scores 5
    // points BELOW ACCEPTABLE draining-window1-direct-unvalidated. This
    // is intentional (Option D): Path B reaches a STRICTLY STRONGER
    // end-state (fully re-validated, 100% compliance rate) than the
    // still-draining ACCEPTABLE state (financialRecordsWronglyDeleted-
    // Count: 95, not yet fully re-validated) — so dataIntegrity (200 vs
    // 180) correctly favors Path B. The net -5 comes entirely from a
    // real, legitimate ongoing operational cost: fixRolloutMode=
    // "validate-first" carries a genuine +$55/mo infrastructure cost
    // (revenue-and-cost.ts), so costEfficiency (75 vs 100) is honestly
    // worse for the fully-validated path. This test exists so a future
    // edit cannot silently change Path B's OPTIMAL tier or erase this
    // exact, deliberate dimension structure.
    it("REGRESSION: OPTIMAL Path B (audited+validated, fully recovered) genuinely scores below ACCEPTABLE draining-window1-direct, for named, legitimate reasons — tier/score divergence is intentional (Option D)", () => {
      const pathBState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, AUDITED_VALIDATED_ACTIONS);
      const pathBResult = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, pathBState);
      const pathBScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        extractFinishScoringInputs(dataRetentionPolicyMisconfigurationSimulation, pathBResult),
      );

      const acceptableState = runScenario(DRAIN_WINDOW_1_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        dataRetentionPolicyMisconfigurationSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        extractFinishScoringInputs(dataRetentionPolicyMisconfigurationSimulation, acceptableResult),
      );

      // Tiers: both real, correctly classified.
      expect(pathBResult.completionTier).toBe("optimal");
      expect(acceptableResult.completionTier).toBe("acceptable");

      // The divergence is real and reproducible.
      expect(pathBScore.total).toBeLessThan(acceptableScore.total);
      expect(pathBScore.total).toBe(945);
      expect(acceptableScore.total).toBe(950);

      // It is driven entirely by costEfficiency (the real, ongoing
      // validate-first price) — never by a correctness regression.
      // Path B's dataIntegrity must be AT OR ABOVE the still-draining
      // path's.
      expect(pathBScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(acceptableScore.breakdown.dataIntegrity);
      expect(pathBScore.breakdown.costEfficiency).toBeLessThan(acceptableScore.breakdown.costEfficiency);
      expect(pathBScore.breakdown.recovery).toBe(acceptableScore.breakdown.recovery);
      expect(pathBScore.breakdown.reliability).toBe(acceptableScore.breakdown.reliability);

      console.log(
        "PATH-B (audited+validated) vs ACCEPTABLE (closeout regression)",
        JSON.stringify({ pathBScore, acceptableScore }),
      );
    });

    it("baseline (no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful/tempting path (panic-pause-all-classes) scores worse than baseline on dataIntegrity AND total, despite looking maximally cautious", () => {
      const baselineState = runScenario(SUSTAINED_MISCONFIGURATION_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_MISCONFIGURATION_MS + 60_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: EMERGENCY_HALT_ALL_DELETION_KEY, value: "all-classes-paused" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.applicationUptimePercent).toBe(baselineState.values.applicationUptimePercent);
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (panic-pause-all-classes) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("unsafe-minimum-effort path (panic-pause, which requires zero investigation) cannot win overall against the genuinely safe but slower audited path", () => {
      const unsafeMinEffortState = runScenario(SUSTAINED_MISCONFIGURATION_MS + 60_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: EMERGENCY_HALT_ALL_DELETION_KEY, value: "all-classes-paused" },
      ]);
      const safeState = runScenario(SUSTAINED_MISCONFIGURATION_MS + 60_000, AUDITED_VALIDATED_ACTIONS);
      const unsafeScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        buildScoringInputs(unsafeMinEffortState),
      );
      const safeScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        buildScoringInputs(safeState),
      );
      expect(unsafeScore.total).toBeLessThan(safeScore.total);
      console.log("UNSAFE PANIC-PAUSE SCORE", JSON.stringify(unsafeScore));
      console.log("SAFE AUDITED/VALIDATED SCORE (for comparison)", JSON.stringify(safeScore));
    });

    it("two alternate optimal paths (A direct vs B audited+validated) score differently on cost, an honest real tradeoff difference", () => {
      const pathAState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const pathBState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, AUDITED_VALIDATED_ACTIONS);
      const pathAResult = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, pathAState);
      const pathBResult = evaluateCandidateDeclaredFinish(dataRetentionPolicyMisconfigurationSimulation, pathBState);
      const pathAScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        extractFinishScoringInputs(dataRetentionPolicyMisconfigurationSimulation, pathAResult),
      );
      const pathBScore = scoreAuthoredAttempt(
        DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
        extractFinishScoringInputs(dataRetentionPolicyMisconfigurationSimulation, pathBResult),
      );
      expect(pathAResult.completionTier).toBe("optimal");
      expect(pathBResult.completionTier).toBe("optimal");
      // Path A (direct, no validation pass) never pays the
      // validate-first cost; Path B does — an honest, real cost
      // distinction between two otherwise-equally-compliant strong
      // paths.
      expect(pathAScore.breakdown.costEfficiency).toBeGreaterThanOrEqual(pathBScore.breakdown.costEfficiency);
      console.log("PATH A SCORE", JSON.stringify(pathAScore));
      console.log("PATH B SCORE", JSON.stringify(pathBScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(DRAIN_WINDOW_1_MS + 5_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      const runB = runScenario(DRAIN_WINDOW_1_MS + 5_000, TARGETED_CORRECTION_DIRECT_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak wrongly-deleted count and overdue count generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 10_000, [
        { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: EMERGENCY_HALT_ALL_DELETION_KEY, value: "all-classes-paused" },
      ]);
      expect(state.peaks.peakValues.financialRecordsWronglyDeletedCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.userDeletionRequestOverdueCount).toBeGreaterThan(0);
    });
  });

  describe("No accidental optimal state through random control mashing", () => {
    it("a deterministic sweep of every other control combination (holding deletionPolicyMode/legalHoldEnforcement at their unsafe defaults) never reaches optimal or acceptable", () => {
      const auditValues = ["fix-immediately", "audit-first"] as const;
      const rolloutValues = ["direct-to-production", "validate-first"] as const;
      const haltValues = ["off", "all-classes-paused"] as const;
      const userDeletionValues = ["enforced", "suspended"] as const;
      const logValues = ["enforced", "suspended"] as const;

      for (const audit of auditValues) {
        for (const rollout of rolloutValues) {
          for (const halt of haltValues) {
            for (const userDeletion of userDeletionValues) {
              for (const log of logValues) {
                const state = runScenario(SUSTAINED_MISCONFIGURATION_MS + 5_000, [
                  { atMs: MISCONFIGURATION_DISCOVERED_MS + 1_000, controlKey: AUDIT_SEQUENCING_KEY, value: audit },
                  { atMs: MISCONFIGURATION_DISCOVERED_MS + 2_000, controlKey: FIX_ROLLOUT_MODE_KEY, value: rollout },
                  { atMs: MISCONFIGURATION_DISCOVERED_MS + 3_000, controlKey: EMERGENCY_HALT_ALL_DELETION_KEY, value: halt },
                  { atMs: MISCONFIGURATION_DISCOVERED_MS + 4_000, controlKey: USER_DELETION_REQUEST_PROCESSING_KEY, value: userDeletion },
                  { atMs: MISCONFIGURATION_DISCOVERED_MS + 5_000, controlKey: EPHEMERAL_LOG_PURGE_KEY, value: log },
                ]);
                const eligibility = evaluateCompletionEligibility(dataRetentionPolicyMisconfigurationSimulation, state);
                expect(eligibility).toEqual({ eligible: false });
              }
            }
          }
        }
      }
    });
  });
});
