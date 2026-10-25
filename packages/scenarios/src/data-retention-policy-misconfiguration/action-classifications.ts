import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  AUDIT_SEQUENCING_KEY,
  DELETION_POLICY_MODE_KEY,
  EMERGENCY_HALT_ALL_DELETION_KEY,
  EPHEMERAL_LOG_PURGE_KEY,
  FIX_ROLLOUT_MODE_KEY,
  LEGAL_HOLD_ENFORCEMENT_KEY,
  USER_DELETION_REQUEST_PROCESSING_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── deletionPolicyMode ───────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: DELETION_POLICY_MODE_KEY,
    valueEquals: "financial-class-corrected",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "beneficial",
    feedback: {
      title: "Targeted correction stopped Financial Records from being wrongly purged",
      explanation:
        "Correcting the Financial Records retention rule specifically — rather than touching every data class's policy — stops further wrongful deletion exactly where the misconfiguration actually was, without changing how User-Deletion-Request or Ephemeral Log data is handled at all. This is the scenario's primary targeted remediation lever. It does not, by itself, retroactively establish WHICH specific records were already wrongly deleted before this took effect (see auditSequencing), and it does not close the separate legal-hold gap on its own (see legalHoldEnforcement) — both still need to be addressed for full compliance.",
    },
  },
  {
    id: "acc_2",
    controlKey: DELETION_POLICY_MODE_KEY,
    valueEquals: "misconfigured",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "harmful",
    feedback: {
      title: "Leaving the retention policy misconfigured kept wrongly purging Financial Records",
      explanation:
        "Leaving the Deletion Service on its current retention-policy rollout means Financial Records that must be retained for the mandated window (or are under legal hold) keep being wrongly purged from the Archive every tick. Every wrongly-deleted record during this window is a real, PERMANENT loss — it cannot be undone later, and it stays on the historical record (financialRecordsWronglyDeletedCount's tracked peak) even after the policy is eventually corrected.",
    },
  },

  // ── legalHoldEnforcement ─────────────────────────────────────────────
  {
    id: "acc_3",
    controlKey: LEGAL_HOLD_ENFORCEMENT_KEY,
    valueEquals: "enforced",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "beneficial",
    feedback: {
      title: "Enforcing legal holds closed an independent gap the main policy fix does not cover",
      explanation:
        "Making legal-hold status an absolute, unconditional purge-blocker is independent of whichever retention policy is currently configured — even a correctly-scoped Financial Records policy would still wrongly purge a record under active legal hold once its nominal 7-year window elapsed, unless this is also engaged. Required alongside deletionPolicyMode's correction, not a substitute for it.",
    },
  },
  {
    id: "acc_4",
    controlKey: LEGAL_HOLD_ENFORCEMENT_KEY,
    valueEquals: "unenforced",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "harmful",
    feedback: {
      title: "Unenforced legal holds leave records under active litigation exposed even after the main fix",
      explanation:
        "Leaving legal-hold status unconsulted means a record under active legal hold is purged exactly like any other record in its class once its nominal retention window elapses — regardless of whether the main Financial Records policy has otherwise been corrected. This is a distinct violation from the main misconfiguration and is checked independently.",
    },
  },

  // ── emergencyHaltAllDeletion ─────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: EMERGENCY_HALT_ALL_DELETION_KEY,
    valueEquals: "all-classes-paused",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "harmful",
    feedback: {
      title: "Pausing all deletion looked maximally cautious but created a second, unrelated violation",
      explanation:
        "Halting deletion fleet-wide the instant the Financial Records problem is discovered does stop further wrongful purging on that class — but it also halts the completely unrelated, correctly-configured User-Deletion-Request erasure jobs that were never part of the actual misconfiguration. Those requests keep arriving on their normal schedule while nothing processes them, so they age past their own mandated erasure deadline — a different, independent compliance violation this scenario treats as seriously as the original one. A targeted, per-class correction (deletionPolicyMode + legalHoldEnforcement) solves the real problem without creating this one.",
    },
  },
  {
    id: "acc_6",
    controlKey: EMERGENCY_HALT_ALL_DELETION_KEY,
    valueEquals: "off",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the fleet-wide halt disengaged kept every unrelated data class running on schedule",
      explanation:
        "Not reaching for a fleet-wide emergency halt means User-Deletion-Request and Ephemeral Log processing continue on their normal schedules, completely unaffected by the Financial Records problem. By itself this neither fixes nor worsens anything — it simply avoids widening the incident's blast radius while the real, targeted fix (deletionPolicyMode/legalHoldEnforcement) is applied.",
    },
  },

  // ── auditSequencing ──────────────────────────────────────────────────
  {
    id: "acc_7",
    controlKey: AUDIT_SEQUENCING_KEY,
    valueEquals: "audit-first",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "beneficial",
    feedback: {
      title: "Auditing affected records before fixing established an accurate picture of the damage",
      explanation:
        "Running a full affected-record audit before applying the corrective policy change means the business ends this incident with a known, accurate accounting of exactly which Financial Records were wrongly deleted — a required compliance deliverable after an incident like this, not an optional nicety. It does not slow down how quickly the live bleeding stops (the policy correction itself is applied at the same real-world speed either way), but it does mean the audit is still running while the fix lands, rather than starting it after.",
    },
  },
  {
    id: "acc_8",
    controlKey: AUDIT_SEQUENCING_KEY,
    valueEquals: "fix-immediately",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "neutral",
    feedback: {
      title: "Fixing immediately stopped the bleeding just as fast, but never established which records were affected",
      explanation:
        "Applying the corrective policy without first running an affected-record audit stops further wrongful deletion exactly as fast as auditing first would have — but it means this attempt never establishes an accurate, verified picture of which specific Financial Records were already wrongly deleted before the fix landed. affectedRecordAuditStatus permanently reads 'never-completed' for the rest of the attempt once a fix is applied this way. Not unsafe on the live compliance fields, but a real, honest completeness gap in this incident's record.",
    },
  },

  // ── fixRolloutMode ───────────────────────────────────────────────────
  {
    id: "acc_9",
    controlKey: FIX_ROLLOUT_MODE_KEY,
    valueEquals: "validate-first",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "beneficial",
    feedback: {
      title: "Validating the correction against a held-out sample caught scope mistakes before touching production again",
      explanation:
        "Running the corrected Financial Records retention rule against a held-out sample before applying it fleet-wide is what actually catches a mis-scoped correction before it touches real records a second time. A real, modest extra time/compute cost (see revenue-and-cost.ts), but a genuine safety margin on the correction itself, not merely on the original misconfiguration.",
    },
  },
  {
    id: "acc_10",
    controlKey: FIX_ROLLOUT_MODE_KEY,
    valueEquals: "direct-to-production",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "neutral",
    feedback: {
      title: "Rolling the correction straight to production was faster but unvalidated",
      explanation:
        "Applying the corrected retention rule directly to production, with no validation pass first, is genuinely faster and does not by itself make the correction wrong — but it means a second, different scoping mistake in the correction itself would only be discovered after it had already touched real records again, rather than being caught against a held-out sample first.",
    },
  },

  // ── userDeletionRequestProcessing ────────────────────────────────────
  {
    id: "acc_11",
    controlKey: USER_DELETION_REQUEST_PROCESSING_KEY,
    valueEquals: "suspended",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "harmful",
    feedback: {
      title: "Suspending User-Deletion-Request processing created a violation on a class that was never broken",
      explanation:
        "User-Deletion-Request erasure jobs were correctly configured from the start — suspending them (directly, or as a side effect of a fleet-wide halt) stops nothing real and instead lets incoming erasure requests age past their own mandated deadline, a brand-new, independent compliance violation on a data class that was never part of the actual misconfiguration.",
    },
  },
  {
    id: "acc_12",
    controlKey: USER_DELETION_REQUEST_PROCESSING_KEY,
    valueEquals: "enforced",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping User-Deletion-Request processing enforced left a correctly-configured class untouched",
      explanation:
        "Leaving erasure-request processing enforced means this data class — which was never part of the actual misconfiguration — continues meeting its own mandated deletion deadline throughout the incident, exactly as it should.",
    },
  },

  // ── ephemeralLogPurge ────────────────────────────────────────────────
  {
    id: "acc_13",
    controlKey: EPHEMERAL_LOG_PURGE_KEY,
    valueEquals: "suspended",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "neutral",
    feedback: {
      title: "Suspending ephemeral-log purging is not a compliance violation, but it is unnecessary storage cost",
      explanation:
        "Ephemeral Logs have no mandated retention floor or deletion deadline, so suspending their purge never creates a compliance violation — but it does let storage grow with no corresponding benefit, since this class was never involved in the actual problem. A real, if minor, signal that a halt reached wider than it needed to.",
    },
  },
  {
    id: "acc_14",
    controlKey: EPHEMERAL_LOG_PURGE_KEY,
    valueEquals: "enforced",
    whenTriggerEquals: { retentionMisconfigured: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping ephemeral-log purging enforced avoided unnecessary storage growth",
      explanation:
        "Leaving Ephemeral Log purging on its normal schedule keeps storage from growing unnecessarily — this class was never part of the actual misconfiguration and has no retention floor of its own, so there was never a reason to touch it.",
    },
  },
];
