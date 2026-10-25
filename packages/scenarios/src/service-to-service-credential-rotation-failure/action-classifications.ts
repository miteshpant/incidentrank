import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CREDENTIAL_VALIDATION_MODE_KEY,
  NEW_CREDENTIAL_ACTIVATION_KEY,
  OLD_CREDENTIAL_VALIDITY_KEY,
  ROLLBACK_OLD_CREDENTIAL_KEY,
  ROTATION_COHORT_STAGE_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── credentialValidationMode ─────────────────────────────────────
  {
    id: "acc_1",
    controlKey: CREDENTIAL_VALIDATION_MODE_KEY,
    valueEquals: "disabled-temporarily",
    whenTriggerEquals: { rotationActive: true },
    outcome: "harmful",
    feedback: {
      title: "Disabling credential validation restored connectivity by removing authentication entirely",
      explanation:
        "Turning off credential validation made the service-to-service call success rate look like an instant fix — every call that was failing on authentication immediately started succeeding again. That apparent recovery is not real: every call served in this mode was accepted with no authentication at all, a direct violation of the invariant that a credential gap must never be bridged by disabling authentication. Every tick this stayed active added to a permanent, non-resetting count of unauthenticated calls, which stays on the record even after validation is re-enabled, and materially penalizes Data Integrity regardless of how healthy the success rate looked. The sanctioned fix for a premature-revocation gap is re-extending the old credential's validity deliberately and auditably, never this.",
    },
  },
  {
    id: "acc_2",
    controlKey: CREDENTIAL_VALIDATION_MODE_KEY,
    valueEquals: "enforced",
    whenTriggerEquals: { rotationActive: true },
    outcome: "neutral",
    feedback: {
      title: "Enforced validation is the only mode in which a successful call means an authenticated one",
      explanation:
        "Keeping credential validation enforced protects against the central security risk this incident poses — no call is ever accepted without a genuinely valid credential. If an authentication gap exists right now, this setting alone does not close it; use rollbackOldCredentialValidity or complete cohort verification instead of disabling validation.",
    },
  },

  // ── oldCredentialValidity ─────────────────────────────────────────
  {
    id: "acc_3",
    controlKey: OLD_CREDENTIAL_VALIDITY_KEY,
    valueEquals: "revoked",
    whenTriggerEquals: { rotationActive: true },
    outcome: "harmful",
    feedback: {
      title: "Revoking the old credential before every cohort verified adoption created a real outage",
      explanation:
        "Revoking the old credential while rotationCohortStage had not yet reached all-cohorts-verified removed the overlapping-validity safety net for every workload that had not finished rotating — a direct violation of the invariant that premature revocation creates a real outage, not just a security exposure. This is purely an availability consequence, not a security one, as long as credential validation stays enforced; the danger is in how it tempts a bypass.",
    },
  },
  {
    id: "acc_4",
    controlKey: OLD_CREDENTIAL_VALIDITY_KEY,
    valueEquals: "revoked",
    whenTriggerEquals: { rotationActive: false },
    outcome: "neutral",
    feedback: {
      title: "Revoking before the rotation has started has no effect yet",
      explanation:
        "The rotation has not begun yet, so there is no new credential in place and no cohort adoption to protect — this action will matter once the rotation starts.",
    },
  },

  // ── rotationCohortStage ───────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: ROTATION_COHORT_STAGE_KEY,
    valueEquals: "all-cohorts-verified",
    whenTriggerEquals: { rotationActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Verifying all cohorts completed the safe, staged rotation",
      explanation:
        "Confirming every cohort has adopted the new credential — while the old one remains valid and the new credential is genuinely active on Service C — completes the safe overlapping-validity rotation without ever breaking a single workload. This is the real prerequisite for safely revoking the old credential.",
    },
  },
  {
    id: "acc_6",
    controlKey: ROTATION_COHORT_STAGE_KEY,
    valueEquals: "cohort-1-verified",
    whenTriggerEquals: { rotationActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Staging the first cohort is real, bounded progress",
      explanation:
        "Verifying a first cohort's adoption of the new credential, while leaving the old credential valid for everyone else, is a real, bounded step toward a safe rotation — business invariant #4 explicitly allows staged cohorts rather than requiring a single instant fleet-wide rotation.",
    },
  },

  // ── newCredentialActivation ───────────────────────────────────────
  {
    id: "acc_7",
    controlKey: NEW_CREDENTIAL_ACTIVATION_KEY,
    valueEquals: true,
    whenTriggerEquals: { rotationActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Activating the new credential on Service C is the real prerequisite for cohort verification",
      explanation:
        "Until Service C's validator accepts the new credential, no cohort-adoption verification is real — a workload presenting the new credential before this would simply fail. Activating it first, before advancing cohort stage, is the correct sequencing.",
    },
  },
  {
    id: "acc_8",
    controlKey: NEW_CREDENTIAL_ACTIVATION_KEY,
    valueEquals: false,
    whenTriggerEquals: { rotationActive: true },
    outcome: "neutral",
    feedback: {
      title: "The new credential is not yet accepted anywhere",
      explanation:
        "With the new credential not yet activated on Service C, any cohort stage advanced in this state represents no real verification at all — activate the new credential before relying on cohort progress.",
    },
  },

  // ── rollbackOldCredentialValidity ─────────────────────────────────
  {
    id: "acc_9",
    controlKey: ROLLBACK_OLD_CREDENTIAL_KEY,
    valueEquals: true,
    whenTriggerEquals: { rotationActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Deliberately re-extending old credential validity closed the gap without bypassing authentication",
      explanation:
        "Issuing an explicit, auditable rollback of the old credential's validity window closes the same authentication gap a bypass would 'fix' — but every served call remains genuinely authenticated the entire time, with zero contribution to the historical unauthenticated-call count. This is the scenario's required security invariant in action: the fix for a premature revocation is re-extending validity deliberately, never disabling validation. Recovery is not instant — already-failing Service B instances only resume success as they reconnect over the next couple of minutes, not on this same action.",
    },
  },
];
