import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DISTRUST_MARKING_KEY,
  LINEAGE_RECORD_ACTION_KEY,
  PROMOTION_GATE_KEY,
  RETRAIN_DATA_VALIDATION_KEY,
  ROLLBACK_TARGET_KEY,
  SERVING_ARTIFACT_ACTION_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "training-data": "healthy",
  "feature-builder": "healthy",
  trainer: "healthy",
  "model-registry": "healthy",
  "deployment-pipeline": "healthy",
};

// Trainer and Deployment Pipeline NEVER leave "healthy" in this
// scenario, in any rule, including every unsafe one — the entire
// Principal-level point is that training-run success and serving
// uptime never signal the problem. Only Model Registry / Training Data
// health communicates severity.
const corruptedServingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "training-data": "critical",
  "model-registry": "critical",
};

const quarantinedDrainingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "training-data": "degraded",
  "model-registry": "degraded",
};

const lineageDestroyedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "training-data": "critical",
  "model-registry": "critical",
};

/**
 * Authored rule table for Training Pipeline Produces Corrupted Model
 * Artifact, ordered most-specific-first (first-match-wins, top-to-
 * bottom). The permanent lineage-destruction trap is checked first
 * (it is a correctness violation independent of every other control),
 * then the live-corrupted-serving traps, then the two independent
 * alternate strong paths (immediate rollback to last-known-good;
 * hold-for-retrain), then the baseline/no-mitigation family.
 *
 * ROOT CAUSE: a corrupted training dataset has already produced a
 * technically-valid artifact that has already been promoted and is
 * already serving (artifactCorrupted). trainingPipelineSuccessRate and
 * deploymentPipelineUptimePercent never move in ANY rule below — this
 * must never look like a generic infrastructure-failure scenario. The
 * visible symptoms are entirely in artifact-trust and lineage fields:
 * artifactValidationScore, modelOutputErrorRatePercent,
 * currentServingArtifactTrustStatus, lineageAuditStatus,
 * cumulativeDecisionsOnCorruptedModel.
 *
 * CENTRAL JUDGMENT (business invariants #1-#5, phase6e3.md): a
 * corrupted artifact must never be left silently serving live traffic,
 * its record must never be destroyed to "clean up," and promotion of
 * any future artifact must require passing real trust-validation, not
 * merely a shallow health check. servingArtifactAction="quarantine" is
 * what actually stops the LIVE exposure; promotionGateMode=
 * "trust-validation" is what prevents the SAME mistake from recurring;
 * distrustMarking="quarantine-mark-distrusted" is what keeps the
 * forensic record of what happened explicit and complete (vs merely
 * "untouched," which is honest but incomplete); lineageRecordAction
 * must NEVER be "delete-and-overwrite" — that is the permanent,
 * irreversible correctness violation this scenario requires (business
 * invariant #3), independent of every other control's state.
 *
 * REQUIRED ALTERNATE STRONG PATHS (phase6e3.md):
 *   A. rollbackTarget="last-known-good" — immediately repoints serving
 *      at a prior, already-trust-validated artifact. Genuinely safe
 *      the instant it is engaged (no retrain wait), at the cost of
 *      giving up whatever (illusory) improvement the corrupted
 *      artifact's training run claimed.
 *   B. rollbackTarget="hold-for-retrain" — holds promotion open while a
 *      fresh artifact is trained and re-validated from scratch. Never
 *      settles for a prior artifact's quality ceiling, but requires
 *      real elapsed retrain+validate time to reach full trust
 *      (retrainDataValidation genuinely accelerates/de-risks this).
 *
 * NO SCALE-X-OVERLOAD-Y MECHANIC: nothing in this scenario scales a
 * service and then overloads a downstream dependency. Every lever here
 * either gates promotion (A requirement), pulls/repoints serving
 * traffic (B requirement), annotates/preserves a record (C
 * requirement), or spends real retrain/validation compute — none of
 * them create a NEW bottleneck elsewhere.
 */
export const trainingPipelineProducesCorruptedModelArtifactRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // PERMANENT CORRECTNESS TRAP — checked first, independent of every
  // other control: destroying the corrupted artifact's lineage record
  // is never acceptable, however the rest of the system looks.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "lineage-destroyed",
    when: {
      triggerEquals: { artifactCorrupted: true },
      controlEquals: { [LINEAGE_RECORD_ACTION_KEY]: "delete-and-overwrite" },
    },
    incidentState: "lineage-destroyed",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 38,
      modelOutputErrorRatePercent: 22,
      currentServingArtifactTrustStatus: "quarantined",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "compromised",
      cumulativeDecisionsOnCorruptedModel: 260,
      artifactRiskStatus: "lineage-destroyed",
      artifactTrustSeverity: "critical",
    },
    componentHealth: lineageDestroyedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // LIVE CORRUPTED-SERVING TRAPS — the corrupted artifact is still
  // answering production traffic right now (servingArtifactAction left
  // at its default "keep-serving"). Checked before every safe family.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "corrupted-serving-sustained",
    when: {
      triggerEquals: { artifactCorrupted: true, sustainedExposure: true },
      controlEquals: { [SERVING_ARTIFACT_ACTION_KEY]: "keep-serving" },
    },
    incidentState: "corrupted-serving-sustained",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 41,
      modelOutputErrorRatePercent: 34,
      currentServingArtifactTrustStatus: "corrupted-serving",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 420,
      artifactRiskStatus: "corrupted-exposure",
      artifactTrustSeverity: "critical",
    },
    componentHealth: corruptedServingHealth,
  },
  {
    id: "corrupted-serving-active",
    when: {
      triggerEquals: { artifactCorrupted: true },
      controlEquals: { [SERVING_ARTIFACT_ACTION_KEY]: "keep-serving" },
    },
    incidentState: "corrupted-serving-active",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 46,
      modelOutputErrorRatePercent: 27,
      currentServingArtifactTrustStatus: "corrupted-serving",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 95,
      artifactRiskStatus: "corrupted-exposure",
      artifactTrustSeverity: "critical",
    },
    componentHealth: corruptedServingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH A — immediate rollback to last-known-good.
  // Genuinely safe the instant servingArtifactAction="quarantine" AND
  // rollbackTarget="last-known-good" are both engaged — no drain lag
  // needed, since the rollback target was already trust-validated in a
  // prior release. Listed before Path B and before the generic
  // unmitigated baseline so it is recognized as a fully independent
  // route to safety.
  //
  // Four combinations of (promotionGateMode, distrustMarking) are
  // enumerated explicitly below — this is the DEFAULT-VALUE PATH
  // COMPLETENESS requirement in practice: a candidate who engages the
  // rollback but never touches promotionGateMode/distrustMarking
  // (leaving both at their untouched defaults "shallow-check"/
  // "untouched") still reaches a real, named, SAFE terminal rule here
  // (rollback-last-known-good-weak-gate) rather than falling through to
  // baseline once sustainedExposure fires.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: rollback engaged, gate hardened, distrust explicitly
  // marked — the fully closed-loop safe state.
  {
    id: "rollback-last-known-good-full",
    when: {
      triggerEquals: { artifactCorrupted: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "last-known-good",
        [PROMOTION_GATE_KEY]: "trust-validation",
        [DISTRUST_MARKING_KEY]: "quarantine-mark-distrusted",
      },
    },
    incidentState: "rollback-last-known-good-full",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 98,
      modelOutputErrorRatePercent: 2,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "healthy",
      artifactTrustSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE: rollback engaged + gate hardened, but distrust
  // marking left at its untouched default — serving is genuinely safe
  // and the SAME mistake cannot recur, but the forensic record of what
  // happened is left ambiguous rather than explicitly annotated
  // (business invariant #4's "explicit" requirement not yet fully met).
  {
    id: "rollback-last-known-good-gated-unmarked",
    when: {
      triggerEquals: { artifactCorrupted: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "last-known-good",
        [PROMOTION_GATE_KEY]: "trust-validation",
        [DISTRUST_MARKING_KEY]: "untouched",
      },
    },
    incidentState: "rollback-last-known-good-gated-unmarked",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 98,
      modelOutputErrorRatePercent: 2,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE: rollback engaged + distrust explicitly marked, but
  // promotion gate left at its untouched default "shallow-check" —
  // serving is genuinely safe RIGHT NOW and the forensic record is
  // complete, but nothing yet stops a FUTURE shallow-checked artifact
  // from reintroducing the same class of corruption.
  {
    id: "rollback-last-known-good-marked-weak-gate",
    when: {
      triggerEquals: { artifactCorrupted: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "last-known-good",
        [PROMOTION_GATE_KEY]: "shallow-check",
        [DISTRUST_MARKING_KEY]: "quarantine-mark-distrusted",
      },
    },
    incidentState: "rollback-last-known-good-marked-weak-gate",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 90,
      modelOutputErrorRatePercent: 2,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE: rollback engaged, EVERYTHING ELSE left at its
  // untouched default (promotionGateMode="shallow-check",
  // distrustMarking="untouched") — the DEFAULT-VALUE PATH COMPLETENESS
  // regression case named in the critical requirement above. A
  // candidate whose own description of their strategy is simply
  // "quarantine the corrupted artifact and roll back to last-known-
  // good" — and who never separately described touching the promotion
  // gate or the distrust marker — still reaches a real, named, SAFE
  // terminal rule here: the serving artifact is genuinely trusted and
  // zero further corrupted-model decisions can occur, but the gate is
  // still weak and the forensic record is still unmarked, so this is
  // ACCEPTABLE (a real, legitimate degraded-but-safe tier), never a
  // fallthrough to baseline/unsafe.
  {
    id: "rollback-last-known-good-weak-gate",
    when: {
      triggerEquals: { artifactCorrupted: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "last-known-good",
        [PROMOTION_GATE_KEY]: "shallow-check",
        [DISTRUST_MARKING_KEY]: "untouched",
      },
    },
    incidentState: "rollback-last-known-good-weak-gate",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 90,
      modelOutputErrorRatePercent: 2,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH B — hold-for-retrain. Genuinely safe the
  // instant servingArtifactAction="quarantine" is engaged (zero further
  // corrupted-model decisions from that moment on), but full trust in
  // the NEW artifact requires real elapsed retrain+validate time —
  // there is structurally nothing trustworthy to serve until the fresh
  // artifact exists and passes validation. retrainDataValidation
  // genuinely accelerates/de-risks this (an accelerant, not a
  // standalone gate), mirroring pipelinePriority's role in Model
  // Feature Freshness Degradation.
  // ══════════════════════════════════════════════════════════════════

  // ── Fully-elapsed retrain window: EXHAUSTIVE over all 2x2x2
  // combinations of (retrainDataValidation, promotionGateMode,
  // distrustMarking) once servingArtifactAction="quarantine" and
  // rollbackTarget="hold-for-retrain" are engaged and the full retrain
  // window has elapsed. This exhaustiveness is deliberate: the DEFAULT-
  // VALUE PATH COMPLETENESS requirement means a candidate who only
  // explicitly describes engaging quarantine+hold-for-retrain (leaving
  // ANY subset of the other three controls at their untouched defaults)
  // must still land on a real, named, correctly-tiered SAFE rule here
  // once the window elapses — never a fallthrough past this block to
  // "promotion-blocked" rules below (which require retrainWindow1Elapsed
  // = false / "none" rollbackTarget) or all the way to healthy-default.
  //
  // Tiering logic: OPTIMAL requires BOTH promotionGateMode=
  // "trust-validation" AND distrustMarking="quarantine-mark-distrusted"
  // (the two controls that actually close business invariants #1 and
  // #4); retrainDataValidation only modulates artifactValidationScore
  // within a tier (a real, honest accelerant/confidence signal — see
  // controls.ts — never a tier-determining safety gate by itself, since
  // the fresh artifact must still pass whatever promotionGateMode
  // currently requires before this rule's "trusted" status is reached).
  // ACCEPTABLE covers every combination where at least one of
  // (promotionGateMode, distrustMarking) is still at its default.
  {
    id: "hold-for-retrain-fully-validated-full-datacheck",
    when: {
      triggerEquals: { artifactCorrupted: true, retrainWindowFullyValidatedElapsed: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "validate-before-retrain",
        [PROMOTION_GATE_KEY]: "trust-validation",
        [DISTRUST_MARKING_KEY]: "quarantine-mark-distrusted",
      },
    },
    incidentState: "hold-for-retrain-fully-validated-full-datacheck",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 99,
      modelOutputErrorRatePercent: 1,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "healthy",
      artifactTrustSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  // OPTIMAL (equivalent tier): retrainDataValidation left at its
  // untouched default "skip" — the real trust-validation gate the
  // fresh artifact passed is what actually proves it safe; skipping
  // the upstream data re-check only means slightly less a-priori
  // confidence in why the fresh dataset was clean, never a correctness
  // violation by itself (a real, honest, lower artifactValidationScore
  // within the same OPTIMAL tier, mirroring every other
  // accelerant-absent/present pair in this table).
  {
    id: "hold-for-retrain-fully-validated-full-skipdatacheck",
    when: {
      triggerEquals: { artifactCorrupted: true, retrainWindowFullyValidatedElapsed: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "skip",
        [PROMOTION_GATE_KEY]: "trust-validation",
        [DISTRUST_MARKING_KEY]: "quarantine-mark-distrusted",
      },
    },
    incidentState: "hold-for-retrain-fully-validated-full-skipdatacheck",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 96,
      modelOutputErrorRatePercent: 2,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "healthy",
      artifactTrustSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  // ACCEPTABLE: gate hardened, distrust left untouched.
  {
    id: "hold-for-retrain-fully-validated-gated-unmarked-datacheck",
    when: {
      triggerEquals: { artifactCorrupted: true, retrainWindowFullyValidatedElapsed: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "validate-before-retrain",
        [PROMOTION_GATE_KEY]: "trust-validation",
        [DISTRUST_MARKING_KEY]: "untouched",
      },
    },
    incidentState: "hold-for-retrain-fully-validated-gated-unmarked-datacheck",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 99,
      modelOutputErrorRatePercent: 1,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "hold-for-retrain-fully-validated-gated-unmarked-skipdatacheck",
    when: {
      triggerEquals: { artifactCorrupted: true, retrainWindowFullyValidatedElapsed: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "skip",
        [PROMOTION_GATE_KEY]: "trust-validation",
        [DISTRUST_MARKING_KEY]: "untouched",
      },
    },
    incidentState: "hold-for-retrain-fully-validated-gated-unmarked-skipdatacheck",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 96,
      modelOutputErrorRatePercent: 2,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: healthyHealth,
  },
  // ACCEPTABLE: gate left untouched (shallow-check), distrust marked.
  {
    id: "hold-for-retrain-fully-validated-marked-weakgate-datacheck",
    when: {
      triggerEquals: { artifactCorrupted: true, retrainWindowFullyValidatedElapsed: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "validate-before-retrain",
        [PROMOTION_GATE_KEY]: "shallow-check",
        [DISTRUST_MARKING_KEY]: "quarantine-mark-distrusted",
      },
    },
    incidentState: "hold-for-retrain-fully-validated-marked-weakgate-datacheck",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 91,
      modelOutputErrorRatePercent: 3,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: quarantinedDrainingHealth,
  },
  {
    id: "hold-for-retrain-fully-validated-marked-weakgate-skipdatacheck",
    when: {
      triggerEquals: { artifactCorrupted: true, retrainWindowFullyValidatedElapsed: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "skip",
        [PROMOTION_GATE_KEY]: "shallow-check",
        [DISTRUST_MARKING_KEY]: "quarantine-mark-distrusted",
      },
    },
    incidentState: "hold-for-retrain-fully-validated-marked-weakgate-skipdatacheck",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 88,
      modelOutputErrorRatePercent: 4,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: quarantinedDrainingHealth,
  },
  // ACCEPTABLE: EVERYTHING ELSE left at its untouched default
  // (promotionGateMode="shallow-check", distrustMarking="untouched") —
  // the DEFAULT-VALUE PATH COMPLETENESS regression case explicitly
  // named in the batch brief: a candidate whose own description of
  // their strategy is simply "quarantine the corrupted artifact and
  // hold for retrain," who never separately describes touching the
  // promotion gate or the distrust marker, still reaches a real,
  // named, correctly-tiered SAFE terminal rule once the full retrain
  // window elapses — never a fallthrough to healthy-default or any
  // unsafe state.
  {
    id: "hold-for-retrain-fully-validated-weakgate-datacheck",
    when: {
      triggerEquals: { artifactCorrupted: true, retrainWindowFullyValidatedElapsed: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "validate-before-retrain",
        [PROMOTION_GATE_KEY]: "shallow-check",
        [DISTRUST_MARKING_KEY]: "untouched",
      },
    },
    incidentState: "hold-for-retrain-fully-validated-weakgate-datacheck",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 91,
      modelOutputErrorRatePercent: 3,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: quarantinedDrainingHealth,
  },
  {
    id: "hold-for-retrain-fully-validated-weakgate-skipdatacheck",
    when: {
      triggerEquals: { artifactCorrupted: true, retrainWindowFullyValidatedElapsed: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "skip",
        [PROMOTION_GATE_KEY]: "shallow-check",
        [DISTRUST_MARKING_KEY]: "untouched",
      },
    },
    incidentState: "hold-for-retrain-fully-validated-weakgate-skipdatacheck",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 88,
      modelOutputErrorRatePercent: 4,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: quarantinedDrainingHealth,
  },

  // ── ACCEPTABLE: mid-retrain draining state — first retrain window
  // elapsed but not yet fully validated. Quarantine is active (zero
  // live corrupted-model decisions this entire window) but the fresh
  // artifact is not yet trustworthy enough to serve — the candidate is
  // deliberately holding promotion open rather than serving something
  // unverified. A real, bounded, declared cost (no model currently
  // serving at full confidence) distinct from the corrupted-serving
  // traps above (which actively harm) and distinct from full recovery.
  // Gated ONLY on retrainDataValidation (promotionGateMode/
  // distrustMarking do not affect this transient mid-drain state —
  // nothing is being served yet either way, so there is nothing for
  // those two controls to differentiate until the window fully
  // elapses), so both of retrainDataValidation's values are covered
  // directly below with no further combinatorial gap.
  {
    id: "hold-for-retrain-draining-validated",
    when: {
      triggerEquals: {
        artifactCorrupted: true,
        retrainWindow1Elapsed: true,
        retrainWindowFullyValidatedElapsed: false,
      },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "validate-before-retrain",
      },
    },
    incidentState: "hold-for-retrain-draining-validated",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 70,
      modelOutputErrorRatePercent: 8,
      currentServingArtifactTrustStatus: "quarantined",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: quarantinedDrainingHealth,
  },
  {
    id: "hold-for-retrain-draining-skip-datacheck",
    when: {
      triggerEquals: {
        artifactCorrupted: true,
        retrainWindow1Elapsed: true,
        retrainWindowFullyValidatedElapsed: false,
      },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
        [RETRAIN_DATA_VALIDATION_KEY]: "skip",
      },
    },
    incidentState: "hold-for-retrain-draining-skip-datacheck",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 55,
      modelOutputErrorRatePercent: 13,
      currentServingArtifactTrustStatus: "quarantined",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: quarantinedDrainingHealth,
  },

  // ── Just-engaged, PRE-sustained-exposure proof: a candidate who
  // reacts FAST — quarantining and committing to hold-for-retrain
  // before the sustainedExposure threshold even fires — must not be
  // reported as indistinguishable from "nothing happened yet."
  // Without this rule, every rule above requires sustainedExposure/
  // retrainWindow1Elapsed/retrainWindowFullyValidatedElapsed (all
  // still false this early) and quarantined-no-rollback-target below
  // requires rollbackTarget="none" (already overwritten to
  // "hold-for-retrain" here), so execution would otherwise fall all
  // the way through to healthy-default — a false "fully healthy/
  // trusted" read for a candidate who has already correctly
  // remediated. This rule closes that gap: same genuinely-safe
  // "quarantined" serving status and zero further corrupted-model
  // decisions as hold-for-retrain-just-engaged below, just reachable
  // before sustainedExposure has fired too.
  {
    id: "hold-for-retrain-just-engaged-pre-sustained",
    when: {
      triggerEquals: {
        artifactCorrupted: true,
        sustainedExposure: false,
      },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
      },
    },
    incidentState: "hold-for-retrain-just-engaged-pre-sustained",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 0,
      modelOutputErrorRatePercent: 0,
      currentServingArtifactTrustStatus: "quarantined",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: quarantinedDrainingHealth,
  },

  // ── Just-engaged tick-zero proof: quarantine + hold-for-retrain
  // flipped this instant (no elapsed retrain window yet) — nothing
  // trustworthy exists to serve yet, proving the retrain is not
  // instant.
  {
    id: "hold-for-retrain-just-engaged",
    when: {
      triggerEquals: {
        artifactCorrupted: true,
        sustainedExposure: true,
        retrainWindow1Elapsed: false,
      },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "hold-for-retrain",
      },
    },
    incidentState: "hold-for-retrain-just-engaged",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 0,
      modelOutputErrorRatePercent: 0,
      currentServingArtifactTrustStatus: "quarantined",
      promotionGateStatus: "promotion-blocked",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: quarantinedDrainingHealth,
  },

  // ── ACCEPTABLE: quarantined with no rollback target chosen at all
  // (rollbackTarget left at its untouched default "none") — the
  // corrupted artifact is pulled from serving (zero further corrupted-
  // model decisions), but nothing trustworthy has been put in its
  // place. Genuinely safe (no corrupted output reaching production),
  // but a real, bounded cost: nothing is actually serving traffic at
  // full confidence while rollbackTarget remains unset.
  {
    id: "quarantined-no-rollback-target",
    when: {
      triggerEquals: { artifactCorrupted: true },
      controlEquals: {
        [SERVING_ARTIFACT_ACTION_KEY]: "quarantine",
        [ROLLBACK_TARGET_KEY]: "none",
      },
    },
    incidentState: "quarantined-no-rollback-target",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 0,
      modelOutputErrorRatePercent: 0,
      currentServingArtifactTrustStatus: "quarantined",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "safe-quarantined",
      artifactTrustSeverity: "warning",
    },
    componentHealth: quarantinedDrainingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      trainingPipelineSuccessRate: 100,
      deploymentPipelineUptimePercent: 99.95,
      artifactValidationScore: 100,
      modelOutputErrorRatePercent: 2,
      currentServingArtifactTrustStatus: "trusted",
      promotionGateStatus: "promotion-open",
      lineageAuditStatus: "complete",
      cumulativeDecisionsOnCorruptedModel: 0,
      artifactRiskStatus: "healthy",
      artifactTrustSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
