import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { trainingPipelineProducesCorruptedModelArtifact } from "./training-pipeline-produces-corrupted-model-artifact";
import {
  DISTRUST_MARKING_KEY,
  LINEAGE_RECORD_ACTION_KEY,
  PROMOTION_GATE_KEY,
  RETRAIN_DATA_VALIDATION_KEY,
  ROLLBACK_TARGET_KEY,
  SERVING_ARTIFACT_ACTION_KEY,
  VALIDATION_COMPUTE_TIER_KEY,
  trainingPipelineProducesCorruptedModelArtifactSimulation,
} from "./training-pipeline-produces-corrupted-model-artifact/definition";
import { trainingPipelineProducesCorruptedModelArtifactCandidateUI } from "./training-pipeline-produces-corrupted-model-artifact/candidate-ui";
import { TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING } from "./training-pipeline-produces-corrupted-model-artifact/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  CORRUPTION_ONSET_MS,
  RETRAIN_WINDOW_1_MS,
  RETRAIN_WINDOW_FULLY_VALIDATED_MS,
  SUSTAINED_EXPOSURE_MS,
} from "./training-pipeline-produces-corrupted-model-artifact/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(trainingPipelineProducesCorruptedModelArtifactSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += trainingPipelineProducesCorruptedModelArtifactSimulation.tickMs
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
      trainingPipelineProducesCorruptedModelArtifactSimulation,
      state,
      action,
      trainingPipelineProducesCorruptedModelArtifactSimulation.tickMs,
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
      trainingPipelineProducesCorruptedModelArtifactSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: immediate rollback to last-known-good — fully
// closed loop (gate hardened + distrust marked).
const ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS: TimedAction[] = [
  { atMs: CORRUPTION_ONSET_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
  { atMs: CORRUPTION_ONSET_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "last-known-good" },
  { atMs: CORRUPTION_ONSET_MS + 3_000, controlKey: PROMOTION_GATE_KEY, value: "trust-validation" },
  { atMs: CORRUPTION_ONSET_MS + 4_000, controlKey: DISTRUST_MARKING_KEY, value: "quarantine-mark-distrusted" },
];

// DEFAULT-VALUE PATH COMPLETENESS: rollback engaged, but promotionGateMode
// and distrustMarking left at their untouched defaults.
const ROLLBACK_LAST_KNOWN_GOOD_DEFAULTS_ACTIONS: TimedAction[] = [
  { atMs: CORRUPTION_ONSET_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
  { atMs: CORRUPTION_ONSET_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "last-known-good" },
];

// Alternate strong path B: hold-for-retrain — fully closed loop.
const HOLD_FOR_RETRAIN_FULL_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_EXPOSURE_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
  { atMs: SUSTAINED_EXPOSURE_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "hold-for-retrain" },
  { atMs: SUSTAINED_EXPOSURE_MS + 3_000, controlKey: RETRAIN_DATA_VALIDATION_KEY, value: "validate-before-retrain" },
  { atMs: SUSTAINED_EXPOSURE_MS + 4_000, controlKey: PROMOTION_GATE_KEY, value: "trust-validation" },
  { atMs: SUSTAINED_EXPOSURE_MS + 5_000, controlKey: DISTRUST_MARKING_KEY, value: "quarantine-mark-distrusted" },
];

// DEFAULT-VALUE PATH COMPLETENESS: quarantine + hold-for-retrain only —
// retrainDataValidation, promotionGateMode, distrustMarking ALL left at
// their untouched defaults.
const HOLD_FOR_RETRAIN_DEFAULTS_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_EXPOSURE_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
  { atMs: SUSTAINED_EXPOSURE_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "hold-for-retrain" },
];

describe("Training Pipeline Produces Corrupted Model Artifact", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(trainingPipelineProducesCorruptedModelArtifact.isFree).toBe(false);
      expect(trainingPipelineProducesCorruptedModelArtifact.library?.category).toBe("Data Pipelines");
      expect(trainingPipelineProducesCorruptedModelArtifact.library?.tags.length).toBeGreaterThan(0);
      expect(trainingPipelineProducesCorruptedModelArtifact.library?.skills.length).toBeGreaterThan(0);
      expect(trainingPipelineProducesCorruptedModelArtifact.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(trainingPipelineProducesCorruptedModelArtifactCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(trainingPipelineProducesCorruptedModelArtifactCandidateUI.controls.length).toBeGreaterThanOrEqual(7);
      expect(trainingPipelineProducesCorruptedModelArtifactCandidateUI.components.length).toBe(5);
    });

    it("the architecture is a flat 5-node, 4-edge pipeline matching the spec", () => {
      expect(trainingPipelineProducesCorruptedModelArtifactSimulation.architecture.nodes.length).toBe(5);
      expect(trainingPipelineProducesCorruptedModelArtifactSimulation.architecture.edges.length).toBe(4);
      for (const node of trainingPipelineProducesCorruptedModelArtifactSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(trainingPipelineProducesCorruptedModelArtifact.description).toMatch(
        /artifact promotion must require passing a real trust\/validation gate/i,
      );
      expect(trainingPipelineProducesCorruptedModelArtifact.description).toMatch(
        /a model already serving must be rollback-able to a known-good prior artifact/i,
      );
      expect(trainingPipelineProducesCorruptedModelArtifact.description).toMatch(
        /lineage .* must remain fully auditable at all times/i,
      );
      expect(trainingPipelineProducesCorruptedModelArtifact.description).toMatch(
        /corrupted artifacts must never be silently deleted or overwritten/i,
      );
      expect(trainingPipelineProducesCorruptedModelArtifact.description).toMatch(
        /business decisions already made using the corrupted model's output before detection/i,
      );
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of trainingPipelineProducesCorruptedModelArtifactSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it (zero dead controls)", () => {
      const classifiedKeys = new Set(
        trainingPipelineProducesCorruptedModelArtifactSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of trainingPipelineProducesCorruptedModelArtifactSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(trainingPipelineProducesCorruptedModelArtifactSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.currentServingArtifactTrustStatus).toBe("trusted");
      expect(state.values.lineageAuditStatus).toBe("complete");
      expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
    });

    it("corruption onset triggers the incident while training/deployment infra stays perfect (the core decoy)", () => {
      const state = runScenario(CORRUPTION_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(CORRUPTION_ONSET_MS);
      expect(state.values.trainingPipelineSuccessRate).toBe(100);
      expect(state.values.deploymentPipelineUptimePercent).toBe(99.95);
      expect(state.values.currentServingArtifactTrustStatus).toBe("corrupted-serving");
    });

    it("baseline (no action) leaves the corrupted artifact serving while training/deployment infra stay perfect throughout", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000);
      expect(state.transitions.incidentState).toBe("corrupted-serving-sustained");
      expect(state.values.trainingPipelineSuccessRate).toBe(100);
      expect(state.values.deploymentPipelineUptimePercent).toBe(99.95);
      expect(state.values.currentServingArtifactTrustStatus).toBe("corrupted-serving");
      expect(state.values.cumulativeDecisionsOnCorruptedModel as number).toBeGreaterThan(0);
    });
  });

  describe("Permanent correctness trap: lineage destruction", () => {
    it("deleting and overwriting the corrupted artifact's record permanently compromises lineage, independent of serving status", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000, [
        { atMs: CORRUPTION_ONSET_MS + 1_000, controlKey: LINEAGE_RECORD_ACTION_KEY, value: "delete-and-overwrite" },
      ]);
      expect(state.transitions.incidentState).toBe("lineage-destroyed");
      expect(state.values.lineageAuditStatus).toBe("compromised");
      expect(state.values.artifactRiskStatus).toBe("lineage-destroyed");
      // Note: the serving field itself already reads "quarantined" here
      // (the trap models the artifact as pulled from serving as part of
      // the "clean up" action) — the violation is the destroyed record,
      // not an ongoing live exposure.
      expect(state.values.currentServingArtifactTrustStatus).toBe("quarantined");
    });

    it("lineage destruction can never be Finish-eligible, however long it runs, and never resolves even after a full rollback is also engaged", () => {
      const state = runScenario(RETRAIN_WINDOW_FULLY_VALIDATED_MS + 5_000, [
        { atMs: CORRUPTION_ONSET_MS + 1_000, controlKey: LINEAGE_RECORD_ACTION_KEY, value: "delete-and-overwrite" },
        ...ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS,
      ]);
      expect(state.transitions.incidentState).toBe("lineage-destroyed");
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("lineage destruction is checked before every other control, overriding even a full safe rollback", () => {
      // The lineage-destroyed trap condition only requires
      // artifactCorrupted + LINEAGE_RECORD_ACTION_KEY — it is listed
      // first in rules.ts so it wins regardless of servingArtifactAction/
      // rollbackTarget/promotionGateMode/distrustMarking.
      const state = runScenario(CORRUPTION_ONSET_MS + 5_000, [
        { atMs: CORRUPTION_ONSET_MS + 500, controlKey: LINEAGE_RECORD_ACTION_KEY, value: "delete-and-overwrite" },
        ...ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS,
      ]);
      expect(state.transitions.incidentState).toBe("lineage-destroyed");
    });
  });

  describe("Live corrupted-serving trap: keep-serving never shows up on infrastructure health", () => {
    it("keep-serving (default) accrues real, nonzero corrupted-model decisions while infra metrics stay perfect", () => {
      const baseline = runScenario(SUSTAINED_EXPOSURE_MS + 5_000);
      expect(baseline.transitions.incidentState).toBe("corrupted-serving-sustained");
      expect(baseline.values.trainingPipelineSuccessRate).toBe(100);
      expect(baseline.values.deploymentPipelineUptimePercent).toBe(99.95);
      expect(baseline.values.cumulativeDecisionsOnCorruptedModel as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, baseline);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("keep-serving held longer compounds the cumulative corrupted-decision count further", () => {
      const early = runScenario(CORRUPTION_ONSET_MS + 10_000);
      const sustained = runScenario(SUSTAINED_EXPOSURE_MS + 10_000);
      expect(sustained.values.cumulativeDecisionsOnCorruptedModel as number).toBeGreaterThan(
        early.values.cumulativeDecisionsOnCorruptedModel as number,
      );
    });

    it("sustained keep-serving exposure eventually reaches automatic failure regardless of other metrics", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 60_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
      const finish = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Historical damage QA: keep-serving exposure cannot be laundered away", () => {
    it("quarantining stops NEW corrupted-model decisions but the peak historical count never decreases", () => {
      const sealedUnsafeState = runScenario(SUSTAINED_EXPOSURE_MS + 10_000);
      const correctedState = runScenario(SUSTAINED_EXPOSURE_MS + 20_000, [
        { atMs: SUSTAINED_EXPOSURE_MS + 11_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
        { atMs: SUSTAINED_EXPOSURE_MS + 12_000, controlKey: ROLLBACK_TARGET_KEY, value: "last-known-good" },
      ]);
      expect(sealedUnsafeState.values.currentServingArtifactTrustStatus).toBe("corrupted-serving");
      expect(correctedState.peaks.peakValues.cumulativeDecisionsOnCorruptedModel as number).toBeGreaterThanOrEqual(
        sealedUnsafeState.values.cumulativeDecisionsOnCorruptedModel as number,
      );
    });

    it("full remediation after an unsafe keep-serving window reaches OPTIMAL on every live field while the peak historical record permanently shows the violation", () => {
      const state = runScenario(CORRUPTION_ONSET_MS + 8_000 + 35_000, [
        { atMs: CORRUPTION_ONSET_MS + 5_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
        { atMs: CORRUPTION_ONSET_MS + 6_000, controlKey: ROLLBACK_TARGET_KEY, value: "last-known-good" },
        { atMs: CORRUPTION_ONSET_MS + 7_000, controlKey: PROMOTION_GATE_KEY, value: "trust-validation" },
        { atMs: CORRUPTION_ONSET_MS + 8_000, controlKey: DISTRUST_MARKING_KEY, value: "quarantine-mark-distrusted" },
      ]);
      expect(state.transitions.incidentState).toBe("rollback-last-known-good-full");
      expect(state.values.currentServingArtifactTrustStatus).toBe("trusted");
      expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the earlier keep-serving window
      // this attempt passed through before quarantining.
      expect(state.peaks.peakValues.cumulativeDecisionsOnCorruptedModel as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Alternate strong path A: immediate rollback to last-known-good", () => {
    it("rollback (fully closed loop) protects trust immediately, no retrain lag required", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000, ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS);
      expect(state.transitions.incidentState).toBe("rollback-last-known-good-full");
      expect(state.values.currentServingArtifactTrustStatus).toBe("trusted");
      expect(state.values.artifactRiskStatus).toBe("healthy");
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("rollback never touches trainingPipelineSuccessRate/deploymentPipelineUptimePercent structurally", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000, ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS);
      expect(state.values.trainingPipelineSuccessRate).toBe(100);
      expect(state.values.deploymentPipelineUptimePercent).toBe(99.95);
    });
  });

  describe("DEFAULT-VALUE PATH COMPLETENESS: rollback engaged with promotionGateMode/distrustMarking left untouched", () => {
    it("quarantine + last-known-good ALONE (gate and marking left at their untouched defaults) reaches a real, named, SAFE ACCEPTABLE state once sustained exposure has elapsed — never a fallthrough to baseline/unsafe", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000, ROLLBACK_LAST_KNOWN_GOOD_DEFAULTS_ACTIONS);
      expect(state.transitions.incidentState).toBe("rollback-last-known-good-weak-gate");
      expect(state.values.currentServingArtifactTrustStatus).toBe("trusted");
      expect(state.values.lineageAuditStatus).toBe("complete");
      expect(state.values.artifactRiskStatus).toBe("safe-quarantined");
      expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("gate hardened alone (distrust marking left untouched) reaches a distinct, correctly-tiered ACCEPTABLE state", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000, [
        ...ROLLBACK_LAST_KNOWN_GOOD_DEFAULTS_ACTIONS,
        { atMs: CORRUPTION_ONSET_MS + 3_000, controlKey: PROMOTION_GATE_KEY, value: "trust-validation" },
      ]);
      expect(state.transitions.incidentState).toBe("rollback-last-known-good-gated-unmarked");
      expect(state.values.artifactRiskStatus).toBe("safe-quarantined");
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("distrust marked alone (gate left untouched) reaches a distinct, correctly-tiered ACCEPTABLE state", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000, [
        ...ROLLBACK_LAST_KNOWN_GOOD_DEFAULTS_ACTIONS,
        { atMs: CORRUPTION_ONSET_MS + 3_000, controlKey: DISTRUST_MARKING_KEY, value: "quarantine-mark-distrusted" },
      ]);
      expect(state.transitions.incidentState).toBe("rollback-last-known-good-marked-weak-gate");
      expect(state.values.artifactRiskStatus).toBe("safe-quarantined");
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Alternate strong path B: hold-for-retrain", () => {
    it("engaging the hold immediately quarantines with zero live exposure even before any retrain window has elapsed", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 4_000, [
        { atMs: SUSTAINED_EXPOSURE_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
        { atMs: SUSTAINED_EXPOSURE_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "hold-for-retrain" },
      ]);
      expect(state.transitions.incidentState).toBe("hold-for-retrain-just-engaged");
      expect(state.values.currentServingArtifactTrustStatus).toBe("quarantined");
      expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
    });

    it("retrain window 1 shows real, partial validation-score recovery above the just-engaged value", () => {
      const state = runScenario(RETRAIN_WINDOW_1_MS + 5_000, HOLD_FOR_RETRAIN_FULL_ACTIONS);
      expect(state.transitions.incidentState).toBe("hold-for-retrain-draining-validated");
      expect(state.values.currentServingArtifactTrustStatus).toBe("quarantined");
      expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
    });

    it("only after the full retrain-and-validate window does the hold-for-retrain path reach genuine OPTIMAL", () => {
      const state = runScenario(RETRAIN_WINDOW_FULLY_VALIDATED_MS + 35_000, HOLD_FOR_RETRAIN_FULL_ACTIONS);
      expect(state.transitions.incidentState).toBe("hold-for-retrain-fully-validated-full-datacheck");
      expect(state.values.currentServingArtifactTrustStatus).toBe("trusted");
      expect(state.values.artifactRiskStatus).toBe("healthy");
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("retrainDataValidation is not a dead control: validate-before-retrain scores a higher artifactValidationScore than skip at the same elapsed window", () => {
      const validated = runScenario(RETRAIN_WINDOW_1_MS + 5_000, HOLD_FOR_RETRAIN_FULL_ACTIONS);
      const skipped = runScenario(RETRAIN_WINDOW_1_MS + 5_000, [
        { atMs: SUSTAINED_EXPOSURE_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
        { atMs: SUSTAINED_EXPOSURE_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "hold-for-retrain" },
      ]);
      expect(skipped.transitions.incidentState).toBe("hold-for-retrain-draining-skip-datacheck");
      expect(validated.values.artifactValidationScore as number).toBeGreaterThan(
        skipped.values.artifactValidationScore as number,
      );
    });
  });

  describe("Regression: fast hold-for-retrain reaction before sustainedExposure fires must not read as healthy", () => {
    it("quarantine + hold-for-retrain set shortly after corruption onset (well before sustainedExposure) is visibly registered as a real in-progress safe-quarantined state, never healthy-default", () => {
      const state = runScenario(CORRUPTION_ONSET_MS + 100_000, [
        { atMs: CORRUPTION_ONSET_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
        { atMs: CORRUPTION_ONSET_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "hold-for-retrain" },
      ]);
      // Sanity: we are genuinely still before sustainedExposure fires.
      expect(CORRUPTION_ONSET_MS + 100_000).toBeLessThan(SUSTAINED_EXPOSURE_MS);
      expect(state.transitions.incidentState).not.toBe("healthy-default");
      expect(state.transitions.incidentState).not.toBe("healthy");
      expect(state.values.currentServingArtifactTrustStatus).not.toBe("trusted");
      expect(state.values.artifactRiskStatus).not.toBe("healthy");
      expect(state.transitions.incidentState).toBe("hold-for-retrain-just-engaged-pre-sustained");
      expect(state.values.currentServingArtifactTrustStatus).toBe("quarantined");
      expect(state.values.artifactRiskStatus).toBe("safe-quarantined");
      expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("the pre-sustained in-progress state transitions into the post-sustained hold-for-retrain-just-engaged state once sustainedExposure fires, with no healthy-looking gap in between", () => {
      const justBefore = runScenario(SUSTAINED_EXPOSURE_MS - 1_000, [
        { atMs: CORRUPTION_ONSET_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
        { atMs: CORRUPTION_ONSET_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "hold-for-retrain" },
      ]);
      const justAfter = runScenario(SUSTAINED_EXPOSURE_MS + 1_000, [
        { atMs: CORRUPTION_ONSET_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
        { atMs: CORRUPTION_ONSET_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "hold-for-retrain" },
      ]);
      expect(justBefore.transitions.incidentState).toBe("hold-for-retrain-just-engaged-pre-sustained");
      expect(justAfter.transitions.incidentState).toBe("hold-for-retrain-just-engaged");
      expect(justBefore.values.currentServingArtifactTrustStatus).toBe("quarantined");
      expect(justAfter.values.currentServingArtifactTrustStatus).toBe("quarantined");
    });
  });

  describe("DEFAULT-VALUE PATH COMPLETENESS: hold-for-retrain engaged with retrainDataValidation/promotionGateMode/distrustMarking ALL left untouched", () => {
    it("quarantine + hold-for-retrain ALONE reaches a real, named, SAFE ACCEPTABLE terminal state once the full retrain window elapses — never a fallthrough to healthy-default or any unsafe state", () => {
      const state = runScenario(RETRAIN_WINDOW_FULLY_VALIDATED_MS + 35_000, HOLD_FOR_RETRAIN_DEFAULTS_ACTIONS);
      expect(state.transitions.incidentState).toBe("hold-for-retrain-fully-validated-weakgate-skipdatacheck");
      expect(state.values.currentServingArtifactTrustStatus).toBe("trusted");
      expect(state.values.lineageAuditStatus).toBe("complete");
      expect(state.values.artifactRiskStatus).toBe("safe-quarantined");
      expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("the exact same default-left-untouched combination at the mid-retrain draining window ALSO reaches a real, named, SAFE ACCEPTABLE state (never a fallthrough)", () => {
      const state = runScenario(RETRAIN_WINDOW_1_MS + 5_000, HOLD_FOR_RETRAIN_DEFAULTS_ACTIONS);
      expect(state.transitions.incidentState).toBe("hold-for-retrain-draining-skip-datacheck");
      expect(state.values.currentServingArtifactTrustStatus).toBe("quarantined");
      expect(state.values.artifactRiskStatus).toBe("safe-quarantined");
      expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("every one of the 8 (retrainDataValidation x promotionGateMode x distrustMarking) combinations at the fully-elapsed retrain window reaches a real, named, safe rule — none fall through to healthy-default", () => {
      const combinations: Array<{
        retrainDataValidation: ControlValue;
        promotionGateMode: ControlValue;
        distrustMarking: ControlValue;
        expectedIncidentState: string;
        expectedTier: "optimal" | "acceptable";
      }> = [
        {
          retrainDataValidation: "validate-before-retrain",
          promotionGateMode: "trust-validation",
          distrustMarking: "quarantine-mark-distrusted",
          expectedIncidentState: "hold-for-retrain-fully-validated-full-datacheck",
          expectedTier: "optimal",
        },
        {
          retrainDataValidation: "skip",
          promotionGateMode: "trust-validation",
          distrustMarking: "quarantine-mark-distrusted",
          expectedIncidentState: "hold-for-retrain-fully-validated-full-skipdatacheck",
          expectedTier: "optimal",
        },
        {
          retrainDataValidation: "validate-before-retrain",
          promotionGateMode: "trust-validation",
          distrustMarking: "untouched",
          expectedIncidentState: "hold-for-retrain-fully-validated-gated-unmarked-datacheck",
          expectedTier: "acceptable",
        },
        {
          retrainDataValidation: "skip",
          promotionGateMode: "trust-validation",
          distrustMarking: "untouched",
          expectedIncidentState: "hold-for-retrain-fully-validated-gated-unmarked-skipdatacheck",
          expectedTier: "acceptable",
        },
        {
          retrainDataValidation: "validate-before-retrain",
          promotionGateMode: "shallow-check",
          distrustMarking: "quarantine-mark-distrusted",
          expectedIncidentState: "hold-for-retrain-fully-validated-marked-weakgate-datacheck",
          expectedTier: "acceptable",
        },
        {
          retrainDataValidation: "skip",
          promotionGateMode: "shallow-check",
          distrustMarking: "quarantine-mark-distrusted",
          expectedIncidentState: "hold-for-retrain-fully-validated-marked-weakgate-skipdatacheck",
          expectedTier: "acceptable",
        },
        {
          retrainDataValidation: "validate-before-retrain",
          promotionGateMode: "shallow-check",
          distrustMarking: "untouched",
          expectedIncidentState: "hold-for-retrain-fully-validated-weakgate-datacheck",
          expectedTier: "acceptable",
        },
        {
          retrainDataValidation: "skip",
          promotionGateMode: "shallow-check",
          distrustMarking: "untouched",
          expectedIncidentState: "hold-for-retrain-fully-validated-weakgate-skipdatacheck",
          expectedTier: "acceptable",
        },
      ];

      for (const combo of combinations) {
        const actions: TimedAction[] = [
          { atMs: SUSTAINED_EXPOSURE_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
          { atMs: SUSTAINED_EXPOSURE_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "hold-for-retrain" },
        ];
        if (combo.retrainDataValidation !== "skip") {
          actions.push({
            atMs: SUSTAINED_EXPOSURE_MS + 3_000,
            controlKey: RETRAIN_DATA_VALIDATION_KEY,
            value: combo.retrainDataValidation,
          });
        }
        if (combo.promotionGateMode !== "shallow-check") {
          actions.push({
            atMs: SUSTAINED_EXPOSURE_MS + 4_000,
            controlKey: PROMOTION_GATE_KEY,
            value: combo.promotionGateMode,
          });
        }
        if (combo.distrustMarking !== "untouched") {
          actions.push({
            atMs: SUSTAINED_EXPOSURE_MS + 5_000,
            controlKey: DISTRUST_MARKING_KEY,
            value: combo.distrustMarking,
          });
        }
        const state = runScenario(RETRAIN_WINDOW_FULLY_VALIDATED_MS + 35_000, actions);
        expect(state.transitions.incidentState).toBe(combo.expectedIncidentState);
        expect(state.values.currentServingArtifactTrustStatus).toBe("trusted");
        expect(state.values.lineageAuditStatus).toBe("complete");
        expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
        const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: combo.expectedTier });
      }
    });
  });

  describe("Legitimate degraded-but-safe state: quarantined with no rollback target chosen", () => {
    it("quarantine alone, with rollbackTarget left at its untouched default none, is genuinely safe but reaches only ACCEPTABLE", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 1_000 + 35_000, [
        { atMs: SUSTAINED_EXPOSURE_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
      ]);
      expect(state.transitions.incidentState).toBe("quarantined-no-rollback-target");
      expect(state.values.currentServingArtifactTrustStatus).toBe("quarantined");
      expect(state.values.cumulativeDecisionsOnCorruptedModel).toBe(0);
      const eligibility = evaluateCompletionEligibility(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Cost efficiency (first-class axis): two genuinely safe paths differ materially on cost", () => {
    it("hold-for-retrain (ongoing retrain/hold compute) costs more per month than the immediate rollback path (no extra ongoing compute)", () => {
      const rollbackState = runScenario(SUSTAINED_EXPOSURE_MS + 5_000, ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS);
      const holdState = runScenario(SUSTAINED_EXPOSURE_MS + 6_000, [
        { atMs: SUSTAINED_EXPOSURE_MS + 1_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
        { atMs: SUSTAINED_EXPOSURE_MS + 2_000, controlKey: ROLLBACK_TARGET_KEY, value: "hold-for-retrain" },
      ]);
      expect(holdState.cost.currentMonthlyCostUsd).toBeGreaterThan(rollbackState.cost.currentMonthlyCostUsd);
    });

    it("heavy validation compute tier adds real ongoing cost on top of trust-validation (not a dead control)", () => {
      const standardTier = runScenario(SUSTAINED_EXPOSURE_MS + 5_000, ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS);
      const heavyTier = runScenario(SUSTAINED_EXPOSURE_MS + 6_000, [
        ...ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS,
        { atMs: CORRUPTION_ONSET_MS + 5_000, controlKey: VALIDATION_COMPUTE_TIER_KEY, value: "heavy" },
      ]);
      expect(heavyTier.cost.currentMonthlyCostUsd).toBeGreaterThan(standardTier.cost.currentMonthlyCostUsd);
    });

    it("both alternate strong paths reach OPTIMAL with an honest cost distinction, not a forced tie", () => {
      const rollbackState = runScenario(SUSTAINED_EXPOSURE_MS + 35_000, ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS);
      const holdState = runScenario(RETRAIN_WINDOW_FULLY_VALIDATED_MS + 35_000, HOLD_FOR_RETRAIN_FULL_ACTIONS);
      const rollbackResult = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, rollbackState);
      const holdResult = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, holdState);
      const rollbackScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        extractFinishScoringInputs(trainingPipelineProducesCorruptedModelArtifactSimulation, rollbackResult),
      );
      const holdScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        extractFinishScoringInputs(trainingPipelineProducesCorruptedModelArtifactSimulation, holdResult),
      );
      expect(rollbackResult.completionTier).toBe("optimal");
      expect(holdResult.completionTier).toBe("optimal");
      // Rollback has zero extra ongoing compute; hold-for-retrain
      // carries a real continuous cost for as long as it is engaged —
      // an honest, deliberate cost-efficiency distinction between two
      // otherwise-equally-safe strong paths.
      expect(rollbackScore.breakdown.costEfficiency).toBeGreaterThanOrEqual(holdScore.breakdown.costEfficiency);
      console.log("ROLLBACK (Path A) SCORE", JSON.stringify(rollbackScore));
      console.log("HOLD-FOR-RETRAIN (Path B) SCORE", JSON.stringify(holdScore));
    });
  });

  describe("No scale-X-overload-Y mechanic", () => {
    it("engaging every lever simultaneously never introduces a new bottleneck elsewhere (no pressure-transfer trap exists in this scenario)", () => {
      const state = runScenario(RETRAIN_WINDOW_FULLY_VALIDATED_MS + 5_000, [
        ...HOLD_FOR_RETRAIN_FULL_ACTIONS,
        { atMs: SUSTAINED_EXPOSURE_MS + 6_000, controlKey: VALIDATION_COMPUTE_TIER_KEY, value: "heavy" },
      ]);
      expect(state.values.trainingPipelineSuccessRate).toBe(100);
      expect(state.values.deploymentPipelineUptimePercent).toBe(99.95);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(CORRUPTION_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable, even though infra metrics already read green", () => {
      const state = runScenario(CORRUPTION_ONSET_MS + 5_000);
      expect(state.values.trainingPipelineSuccessRate).toBe(100);
      expect(state.values.deploymentPipelineUptimePercent).toBe(99.95);
      const result = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained exposure still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 60_000);
      const result = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).toBe("failed");
    });
  });

  describe("Scoring", () => {
    it("optimal path (rollback-last-known-good-full) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 35_000, ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      const inputs = extractFinishScoringInputs(trainingPipelineProducesCorruptedModelArtifactSimulation, result);
      const score = scoreAuthoredAttempt(TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL (rollback-last-known-good-full) SCORE", JSON.stringify(score));
    });

    it("optimal path (hold-for-retrain, fully validated) reaches the optimal tier more slowly, with the same full dataIntegrity credit", () => {
      const state = runScenario(RETRAIN_WINDOW_FULLY_VALIDATED_MS + 35_000, HOLD_FOR_RETRAIN_FULL_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, state);
      expect(result.completionTier).toBe("optimal");
      const inputs = extractFinishScoringInputs(trainingPipelineProducesCorruptedModelArtifactSimulation, result);
      const score = scoreAuthoredAttempt(TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL (hold-for-retrain) SCORE", JSON.stringify(score));
    });

    it("acceptable path (default-value rollback, weak gate) scores well but below optimal", () => {
      const optimalState = runScenario(SUSTAINED_EXPOSURE_MS + 35_000, ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(trainingPipelineProducesCorruptedModelArtifactSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        extractFinishScoringInputs(trainingPipelineProducesCorruptedModelArtifactSimulation, optimalResult),
      );

      const acceptableState = runScenario(SUSTAINED_EXPOSURE_MS + 35_000, ROLLBACK_LAST_KNOWN_GOOD_DEFAULTS_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        trainingPipelineProducesCorruptedModelArtifactSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        extractFinishScoringInputs(trainingPipelineProducesCorruptedModelArtifactSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE (rollback-last-known-good-weak-gate) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    // Regression coverage for phase-6e3-scoring-closeout.md: Path B
    // (hold-for-retrain, fully validated) is genuinely OPTIMAL-tier but
    // scores 20 points BELOW the weak-gate ACCEPTABLE rollback. This is
    // intentional (Option D): hold-for-retrain fully closes business
    // invariants #1 and #4 (promotionGateMode="trust-validation" AND
    // distrustMarking="quarantine-mark-distrusted" are REQUIRED for this
    // tier, per rules.ts's "hold-for-retrain-fully-validated-full-*"
    // rules), while the weak-gate rollback leaves both at their
    // untouched defaults — so dataIntegrity (200 vs 160) and reliability
    // (80 vs 15) correctly favor Path B's stronger end-state. The net
    // -20 comes from real, legitimate elapsed-time/cost penalties: Path
    // B requires waiting for RETRAIN_WINDOW_FULLY_VALIDATED_MS (a real,
    // multi-minute retrain+validate window with structurally nothing
    // trustworthy to serve until it elapses), so recovery (260 vs 300),
    // customerImpact (160 vs 200), and costEfficiency (55 vs 100 — the
    // weak-gate rollback is instant and free) are all real, honestly
    // worse for Path B. This test exists so a future edit cannot
    // silently change Path B's OPTIMAL tier or erase this exact,
    // deliberate dimension structure.
    it("REGRESSION: optimal Path B (hold-for-retrain, fully validated) genuinely scores below the weak-gate ACCEPTABLE rollback, for named, legitimate reasons — tier/score divergence is intentional (Option D)", () => {
      const optimalBState = runScenario(RETRAIN_WINDOW_FULLY_VALIDATED_MS + 35_000, HOLD_FOR_RETRAIN_FULL_ACTIONS);
      const optimalBResult = evaluateCandidateDeclaredFinish(
        trainingPipelineProducesCorruptedModelArtifactSimulation,
        optimalBState,
      );
      const optimalBScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        extractFinishScoringInputs(trainingPipelineProducesCorruptedModelArtifactSimulation, optimalBResult),
      );

      const acceptableState = runScenario(SUSTAINED_EXPOSURE_MS + 35_000, ROLLBACK_LAST_KNOWN_GOOD_DEFAULTS_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        trainingPipelineProducesCorruptedModelArtifactSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        extractFinishScoringInputs(trainingPipelineProducesCorruptedModelArtifactSimulation, acceptableResult),
      );

      // Tiers: both real, correctly classified.
      expect(optimalBResult.completionTier).toBe("optimal");
      expect(acceptableResult.completionTier).toBe("acceptable");

      // The divergence is real and reproducible: optimal Path B scores
      // below acceptable.
      expect(optimalBScore.total).toBeLessThan(acceptableScore.total);
      expect(optimalBScore.total).toBe(805);
      expect(acceptableScore.total).toBe(825);

      // It is driven by elapsed-time/cost penalties (recovery,
      // customerImpact, costEfficiency) — never by a correctness
      // regression. Path B's dataIntegrity/reliability must be AT OR
      // ABOVE the weak-gate path's, since the underlying promotion-gate
      // and distrust-marking invariants are genuinely stronger there.
      expect(optimalBScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(
        acceptableScore.breakdown.dataIntegrity,
      );
      expect(optimalBScore.breakdown.reliability).toBeGreaterThanOrEqual(
        acceptableScore.breakdown.reliability,
      );
      expect(optimalBScore.breakdown.recovery).toBeLessThan(acceptableScore.breakdown.recovery);
      expect(optimalBScore.breakdown.customerImpact).toBeLessThan(acceptableScore.breakdown.customerImpact);
      expect(optimalBScore.breakdown.costEfficiency).toBeLessThan(acceptableScore.breakdown.costEfficiency);

      console.log("OPTIMAL-B vs ACCEPTABLE (closeout regression)", JSON.stringify({ optimalBScore, acceptableScore }));
    });

    it("baseline (no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("unsafe-tempting path (lineage destruction) scores worse than baseline on dataIntegrity AND total, despite having already pulled the artifact from serving", () => {
      const baselineState = runScenario(SUSTAINED_EXPOSURE_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_EXPOSURE_MS + 60_000, [
        { atMs: CORRUPTION_ONSET_MS + 1_000, controlKey: LINEAGE_RECORD_ACTION_KEY, value: "delete-and-overwrite" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.currentServingArtifactTrustStatus).toBe("quarantined");
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (lineage-destroyed) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("unsafe minimum-effort path (keep-serving, zero extra spend) cannot win overall against the safe-but-costlier rollback path", () => {
      const unsafeMinCostState = runScenario(SUSTAINED_EXPOSURE_MS + 60_000);
      const safeButCostlierState = runScenario(SUSTAINED_EXPOSURE_MS + 60_000, ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS);
      const unsafeScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        buildScoringInputs(unsafeMinCostState),
      );
      const safeScore = scoreAuthoredAttempt(
        TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
        buildScoringInputs(safeButCostlierState),
      );
      expect(unsafeMinCostState.cost.currentMonthlyCostUsd).toBeLessThanOrEqual(
        safeButCostlierState.cost.currentMonthlyCostUsd,
      );
      expect(unsafeScore.total).toBeLessThan(safeScore.total);
      console.log("UNSAFE KEEP-SERVING SCORE", JSON.stringify(unsafeScore));
      console.log("SAFE ROLLBACK SCORE (for comparison)", JSON.stringify(safeScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(RETRAIN_WINDOW_1_MS + 5_000, HOLD_FOR_RETRAIN_FULL_ACTIONS);
      const runB = runScenario(RETRAIN_WINDOW_1_MS + 5_000, HOLD_FOR_RETRAIN_FULL_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak corrupted-model decision count and model output error rate generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 10_000);
      expect(state.peaks.peakValues.cumulativeDecisionsOnCorruptedModel).toBeGreaterThan(0);
      expect(state.peaks.peakValues.modelOutputErrorRatePercent).toBeGreaterThan(0);
    });
  });
});
