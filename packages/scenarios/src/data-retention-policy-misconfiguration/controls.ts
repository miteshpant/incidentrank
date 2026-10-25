import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Whether the Deletion Service is still running the misconfigured
 * retention policy that over-deletes Financial Records. "misconfigured"
 * (default) is the root cause itself — every tick it stays here,
 * Financial Records that must be retained for the regulatory window (or
 * are under legal hold) keep being purged from the Archive, a real,
 * permanent, non-resetting loss (see metrics.ts's
 * financialRecordsWronglyDeletedCount / rules.ts). "financial-class-
 * corrected" fixes ONLY the Financial Records retention rule — a
 * targeted, data-class-scoped correction that stops the bleeding on
 * exactly the class that was actually broken, without touching how any
 * other data class is handled. This is the scenario's primary, targeted
 * remediation lever (Alternate Strong Path candidate A, see rules.ts).
 */
export const DELETION_POLICY_MODE_KEY = "deletionPolicyMode";

/**
 * The tempting-but-wrong panic response: pausing ALL deletion across
 * every data class the instant the Financial Records over-deletion is
 * discovered. "off" (default) leaves each data class's deletion
 * schedule running independently. "all-classes-paused" stops the
 * Financial Records bleeding too (nothing further gets purged from
 * Archive while paused) — but it ALSO halts the completely unrelated,
 * correctly-configured User-Deletion-Request erasure jobs that were
 * never part of the actual problem, which keeps THEIR data resident
 * past ITS OWN mandated deletion deadline — a different, independent
 * compliance violation, and the scenario's required "looks maximally
 * cautious" trap (see rules.ts's "panic-pause-all-classes" family and
 * userDeletionRequestOverdueCount's non-resetting counter in
 * metrics.ts). Leaving this "off" and instead using
 * deletionPolicyMode/legalHoldEnforcement (scoped per data class) is
 * what actually solves the real problem without creating a new one.
 */
export const EMERGENCY_HALT_ALL_DELETION_KEY = "emergencyHaltAllDeletion";

/**
 * Whether the Deletion Service checks each record against the Legal
 * Hold Registry before purging it. "unenforced" (default) is part of
 * the misconfiguration — a legal hold on a specific Financial Records
 * subset (records under active litigation/audit) is not consulted at
 * all, so those records can be purged exactly like any other record in
 * the misconfigured class. "enforced" makes legal-hold status an
 * absolute, unconditional purge-blocker, independent of
 * deletionPolicyMode — even a FIXED retention policy would otherwise
 * still purge a legal-hold record once its normal 7-year window
 * nominally elapsed, which is itself a distinct violation this control
 * is what actually prevents (see rules.ts's "legal-hold-breach" trap,
 * reachable even after the main policy is corrected).
 */
export const LEGAL_HOLD_ENFORCEMENT_KEY = "legalHoldEnforcement";

/**
 * Whether affected records are identified and audited BEFORE any
 * corrective deletion-policy change is applied, or the fix is applied
 * immediately without first establishing which records were already
 * wrongly deleted/retained. "audit-first" (default-recommended
 * sequencing, but NOT the control's default value — see allowedValues)
 * runs a full affected-record audit first, so the corrective action is
 * scoped against a known, accurate picture of the damage. "fix-
 * immediately" applies the corrective policy right away without an
 * audit — this does genuinely stop further live damage just as fast as
 * audit-first (the fix itself is not slower), but it means the
 * candidate (and the business) never establishes an accurate picture of
 * which specific records were wrongly deleted, which is itself a
 * required compliance deliverable after an incident like this — a real
 * sequencing consideration (see rules.ts's auditCompletedBeforeFix
 * derived state and scoring.ts's operationalEfficiency/dataIntegrity
 * treatment of it). affectedRecordAuditStatus stays
 * "never-completed" for the rest of the attempt if the fix is applied
 * before an audit ever finishes.
 */
export const AUDIT_SEQUENCING_KEY = "auditSequencing";

/**
 * Whether the Deletion Service actually enforces the User-Deletion-
 * Request erasure deadline for that data class. "enforced" (default —
 * this data class was never part of the actual misconfiguration) keeps
 * erasure requests processed and purged on schedule. "suspended" stops
 * processing them — this happens automatically as a SIDE EFFECT of
 * emergencyHaltAllDeletion="all-classes-paused" (modeled directly on
 * this key so the consequence is visible and attributable), and can
 * also be set directly by a candidate who mistakenly targets the wrong
 * class. Either way, suspending erasure on a class that was never
 * broken creates a brand-new, independent compliance violation
 * (userDeletionRequestOverdueCount keeps climbing) rather than fixing
 * anything.
 */
export const USER_DELETION_REQUEST_PROCESSING_KEY = "userDeletionRequestProcessing";

/**
 * Whether the Deletion Service continues purging Ephemeral Logs (a
 * third, deliberately low-stakes data class with no legal retention
 * floor and no deletion deadline of its own — included specifically so
 * emergencyHaltAllDeletion's blast radius is concrete and visible: it
 * is not just the user-deletion-request class that gets swept up in a
 * panic-wide halt) on its normal schedule. "enforced" (default) keeps
 * this running. "suspended" (the other side effect of
 * emergencyHaltAllDeletion="all-classes-paused") has no real compliance
 * consequence of its own (ephemeral logs have no mandated deletion
 * floor) but does let storage grow unnecessarily — a real, if minor,
 * cost signal that a fleet-wide halt was wider than it needed to be.
 */
export const EPHEMERAL_LOG_PURGE_KEY = "ephemeralLogPurge";

/**
 * How the fix, once decided, is rolled out: validated against a
 * non-production sample before being applied fleet-wide, or applied
 * directly to production. "validate-first" (default-recommended, but
 * NOT the control's default value) runs the corrected Financial Records
 * retention rule against a held-out sample first, catching a
 * mis-scoped correction before it touches production data again.
 * "direct-to-production" applies the corrected rule straight to
 * production with no validation step — genuinely faster, but it is the
 * lever that determines whether a second, different authoring mistake
 * in the correction itself (e.g. a scope that is still slightly wrong)
 * would be caught before or after it touches real records again (see
 * rules.ts's correctionValidated derived state).
 */
export const FIX_ROLLOUT_MODE_KEY = "fixRolloutMode";

export const controls: ControlDefinition[] = [
  {
    key: DELETION_POLICY_MODE_KEY,
    allowedValues: ["misconfigured", "financial-class-corrected"],
    initialValue: "misconfigured",
  },
  {
    key: EMERGENCY_HALT_ALL_DELETION_KEY,
    allowedValues: ["off", "all-classes-paused"],
    initialValue: "off",
  },
  {
    key: LEGAL_HOLD_ENFORCEMENT_KEY,
    allowedValues: ["unenforced", "enforced"],
    initialValue: "unenforced",
  },
  {
    key: AUDIT_SEQUENCING_KEY,
    allowedValues: ["fix-immediately", "audit-first"],
    initialValue: "fix-immediately",
  },
  {
    key: USER_DELETION_REQUEST_PROCESSING_KEY,
    allowedValues: ["enforced", "suspended"],
    initialValue: "enforced",
  },
  {
    key: EPHEMERAL_LOG_PURGE_KEY,
    allowedValues: ["enforced", "suspended"],
    initialValue: "enforced",
  },
  {
    key: FIX_ROLLOUT_MODE_KEY,
    allowedValues: ["direct-to-production", "validate-first"],
    initialValue: "direct-to-production",
  },
];
