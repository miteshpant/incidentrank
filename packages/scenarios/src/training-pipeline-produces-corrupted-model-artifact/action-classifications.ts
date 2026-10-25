import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DISTRUST_MARKING_KEY,
  LINEAGE_RECORD_ACTION_KEY,
  PROMOTION_GATE_KEY,
  RETRAIN_DATA_VALIDATION_KEY,
  ROLLBACK_TARGET_KEY,
  SERVING_ARTIFACT_ACTION_KEY,
  VALIDATION_COMPUTE_TIER_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── servingArtifactAction ────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: SERVING_ARTIFACT_ACTION_KEY,
    valueEquals: "quarantine",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "beneficial",
    feedback: {
      title: "Quarantining the suspect artifact stopped new corrupted-model decisions immediately",
      explanation:
        "Pulling the suspect artifact from Deployment Pipeline the moment it is suspected corrupted stops the LIVE exposure right away — every tick afterward adds zero further decisions to the permanent, non-resetting cumulativeDecisionsOnCorruptedModel count. This does not, by itself, restore a trustworthy model to serving (rollbackTarget is what does that) — but it is the required precondition for every real remediation, since nothing downstream can protect the business from a risk that is still actively answering production traffic.",
    },
  },
  {
    id: "acc_2",
    controlKey: SERVING_ARTIFACT_ACTION_KEY,
    valueEquals: "keep-serving",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "harmful",
    feedback: {
      title: "Leaving the corrupted artifact serving kept answering production traffic from untrusted output",
      explanation:
        "Leaving servingArtifactAction at keep-serving means the artifact already confirmed/suspected corrupted keeps answering real production requests no matter what Model Registry concludes about it. Training-run success and Deployment Pipeline uptime stayed perfectly healthy the entire time this was active — that calm is not real. Every tick this stayed active added to a permanent, non-resetting count of business decisions made on untrusted output, which stays on the record even after the artifact is eventually pulled, and materially penalizes Data Integrity and Reliability regardless of how healthy infrastructure looked.",
    },
  },

  // ── promotionGateMode ────────────────────────────────────────────────
  {
    id: "acc_3",
    controlKey: PROMOTION_GATE_KEY,
    valueEquals: "trust-validation",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "beneficial",
    feedback: {
      title: "Trust-validation closed the gap a shallow health check could never catch",
      explanation:
        "Requiring every future artifact to pass a real held-out trust-validation pass before reaching Deployment Pipeline is the only lever that can catch a technically-valid-but-semantically-wrong artifact BEFORE it reaches production — exactly the hole that let this incident's corrupted artifact through in the first place. This does not undo the current exposure by itself (servingArtifactAction/rollbackTarget do that) — it closes the loop so the SAME class of mistake cannot simply be promoted again the next time a dataset is corrupted.",
    },
  },
  {
    id: "acc_4",
    controlKey: PROMOTION_GATE_KEY,
    valueEquals: "shallow-check",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "neutral",
    feedback: {
      title: "Shallow-check-only promotion is exactly what let the corrupted artifact through",
      explanation:
        "A shallow promotion gate verifies only that an artifact trains without error and responds to basic health checks — schema matches, inference doesn't throw, latency is normal. The corrupted artifact in this incident already passes every one of those checks, because the problem is semantic correctness, not infrastructure health. Leaving promotionGateMode at shallow-check does not worsen the CURRENT exposure by itself, but it leaves the door open for a future corrupted artifact to be promoted again with nothing to stop it.",
    },
  },

  // ── distrustMarking ──────────────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: DISTRUST_MARKING_KEY,
    valueEquals: "quarantine-mark-distrusted",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "beneficial",
    feedback: {
      title: "Explicitly marking the artifact distrusted kept the forensic record complete, not merely silent",
      explanation:
        "Explicitly annotating the corrupted artifact's registry record as distrusted — rather than leaving it ambiguous — is what business invariant #4 actually requires: corrupted artifacts must never be silently deleted/overwritten, but 'untouched' alone does not prove anyone looked at it and confirmed it should never be trusted again. This keeps the audit trail honest and complete without destroying anything.",
    },
  },
  {
    id: "acc_6",
    controlKey: DISTRUST_MARKING_KEY,
    valueEquals: "untouched",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the corrupted artifact's record unmarked kept it honest but left it ambiguous",
      explanation:
        "Leaving distrustMarking at untouched does not destroy anything — the record is exactly as it was written at training time, fully auditable. But it also leaves nothing stopping a future promotion workflow from treating this exact artifact as eligible again, since there is no explicit annotation recording that it was ever found corrupted.",
    },
  },

  // ── lineageRecordAction ──────────────────────────────────────────────
  {
    id: "acc_7",
    controlKey: LINEAGE_RECORD_ACTION_KEY,
    valueEquals: "delete-and-overwrite",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "harmful",
    feedback: {
      title: "Deleting and overwriting the corrupted artifact's record permanently destroyed the forensic trail",
      explanation:
        "Erasing the corrupted artifact's record and overwriting it in place looks like a fast, tidy incident closure — no lingering 'corrupted' entry cluttering the registry — but it is a permanent, irreversible destruction of the one record that could prove which artifact served which requests during the exposure window. This violates business invariant #3 the instant it is engaged and never heals, regardless of anything done afterward: lineageAuditStatus reads 'compromised' for the rest of this attempt no matter what the serving artifact's trust status becomes.",
    },
  },
  {
    id: "acc_8",
    controlKey: LINEAGE_RECORD_ACTION_KEY,
    valueEquals: "preserve",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "beneficial",
    feedback: {
      title: "Preserving the full record kept the incident auditable from start to finish",
      explanation:
        "Keeping the corrupted artifact's dataset lineage, training run, and prior-serving window fully intact — rather than deleting it to 'clean up' — is what lets this incident actually be audited afterward: which dataset produced the corrupted artifact, which requests it served, and when it was caught. This is a required baseline, not an optional nicety — business invariant #3 treats destroying it as a correctness violation regardless of how the rest of the incident was handled.",
    },
  },

  // ── rollbackTarget ───────────────────────────────────────────────────
  {
    id: "acc_9",
    controlKey: ROLLBACK_TARGET_KEY,
    valueEquals: "last-known-good",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "beneficial",
    feedback: {
      title: "Rolling back to last-known-good restored a trustworthy model with no retraining wait",
      explanation:
        "Repointing Deployment Pipeline at a prior artifact that already passed real trust-validation in an earlier release is this scenario's fastest alternate strong path — genuinely safe the instant it is engaged, with no drain lag to wait out. The real cost is giving up whatever improvement the corrupted artifact's training run claimed to deliver, and trusting that the prior artifact's quality ceiling is still acceptable today.",
    },
  },
  {
    id: "acc_10",
    controlKey: ROLLBACK_TARGET_KEY,
    valueEquals: "hold-for-retrain",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "beneficial",
    feedback: {
      title: "Holding for retrain traded real elapsed time for never settling on a prior artifact's ceiling",
      explanation:
        "Holding promotion open while a fresh artifact is trained and re-validated from scratch is this scenario's other legitimate alternate strong path — it never accepts a prior artifact's possibly-stale quality ceiling, but it requires real elapsed retrain-and-validate time before a trustworthy artifact exists at all. Nothing at full confidence serves traffic until that window completes, a real, bounded, declared cost distinct from the corrupted-serving traps.",
    },
  },
  {
    id: "acc_11",
    controlKey: ROLLBACK_TARGET_KEY,
    valueEquals: "none",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "neutral",
    feedback: {
      title: "Quarantining without choosing a rollback target left nothing trustworthy serving",
      explanation:
        "Pulling the corrupted artifact from serving without ever setting rollbackTarget is genuinely safe (zero further corrupted-model decisions), but it leaves Deployment Pipeline with nothing trustworthy to answer traffic with. Not harmful by itself — no corrupted output reaches production — but a real, avoidable gap versus either alternate strong path.",
    },
  },

  // ── retrainDataValidation ────────────────────────────────────────────
  {
    id: "acc_12",
    controlKey: RETRAIN_DATA_VALIDATION_KEY,
    valueEquals: "validate-before-retrain",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "beneficial",
    feedback: {
      title: "Validating the retrain dataset first raised confidence the same corruption would not recur",
      explanation:
        "Only meaningful once rollbackTarget is hold-for-retrain: re-checking the training dataset itself against data-quality invariants before starting a new training run is a real, independent accelerant that raises artifactValidationScore within the hold-for-retrain path. It does not, by itself, replace the final trust-validation gate the fresh artifact must still pass before being trusted — it reduces the odds of reproducing the exact same mistake a second time.",
    },
  },
  {
    id: "acc_13",
    controlKey: RETRAIN_DATA_VALIDATION_KEY,
    valueEquals: "skip",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "neutral",
    feedback: {
      title: "Skipping the retrain-data check relied entirely on the final trust-validation gate",
      explanation:
        "Leaving retrainDataValidation at skip (only meaningful once holding for retrain) retrains from whatever Training Data currently holds without first confirming the original corruption source was fixed. This can reproduce the exact same corrupted artifact a second time — the final promotionGateMode trust-validation pass is still what actually catches it if so, but skipping this upstream check means slightly less a-priori confidence and a real, honest artifactValidationScore gap versus validating first.",
    },
  },

  // ── validationComputeTier ────────────────────────────────────────────
  {
    id: "acc_14",
    controlKey: VALIDATION_COMPUTE_TIER_KEY,
    valueEquals: "heavy",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "neutral",
    feedback: {
      title: "Heavy validation compute bought deeper evidence, not a different safety outcome",
      explanation:
        "Only meaningful once promotionGateMode is trust-validation: running the held-out validation pass at the heavy tier spends a real, independent, higher ongoing compute cost for a larger held-out slice and more comparison metrics. It does not change WHETHER corruption is caught — the standard tier already catches it — only the confidence and detail of the evidence behind that decision.",
    },
  },
  {
    id: "acc_15",
    controlKey: VALIDATION_COMPUTE_TIER_KEY,
    valueEquals: "standard",
    whenTriggerEquals: { artifactCorrupted: true },
    outcome: "neutral",
    feedback: {
      title: "Standard validation compute caught the corruption at normal spend",
      explanation:
        "Leaving validationComputeTier at standard (only meaningful once promotionGateMode is trust-validation) is fine — it already genuinely catches semantic corruption at a modest ongoing compute cost. The heavy tier only adds deeper evidence and confidence, not a different safety outcome, so standard is never itself a shortfall.",
    },
  },
];
