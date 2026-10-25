import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  AUDIT_SEQUENCING_KEY,
  DELETION_POLICY_MODE_KEY,
  EMERGENCY_HALT_ALL_DELETION_KEY,
  EPHEMERAL_LOG_PURGE_KEY,
  FIX_ROLLOUT_MODE_KEY,
  LEGAL_HOLD_ENFORCEMENT_KEY,
  USER_DELETION_REQUEST_PROCESSING_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  application: "healthy",
  "event-store": "healthy",
  "data-lake": "healthy",
  archive: "healthy",
  "deletion-service": "healthy",
};

// Application and Event Store NEVER leave "healthy" in this scenario, in
// any rule, including every unsafe one — the entire Principal-level
// point (and the strategy spec's explicit "availability is largely
// irrelevant") is that uptime/write-success never signal the problem.
// Only Archive / Deletion Service health communicates severity, and only
// for the compliance axis.
const archiveViolatedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  archive: "critical",
  "deletion-service": "critical",
};

const dataLakeViolatedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "data-lake": "critical",
  "deletion-service": "critical",
};

const bothViolatedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "data-lake": "critical",
  archive: "critical",
  "deletion-service": "critical",
};

const draininHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  archive: "degraded",
  "deletion-service": "degraded",
};

/**
 * Authored rule table for Data Retention Policy Misconfiguration,
 * ordered most-specific-first (first-match-wins, top-to-bottom). Every
 * correctness-violation trap is checked before the generic safe/
 * baseline families below it, because a live retention/deletion
 * violation on EITHER data class is never acceptable however healthy
 * Application/Event Store look.
 *
 * ROOT CAUSE: the Deletion Service's most recent retention-policy
 * rollout is misconfigured (retentionMisconfigured) — Financial Records
 * in scope are wrongly purged from the Archive. applicationUptimePercent
 * and eventStoreWriteSuccessRate never move in ANY rule below — per the
 * strategy spec, this must never look like a generic availability
 * incident. The visible symptoms are entirely in the two independent
 * per-data-class compliance fields: financialRecordsWronglyDeletedCount/
 * ComplianceRatePercent/RetentionStatus, and
 * userDeletionRequestOverdueCount/ComplianceRatePercent/RetentionStatus.
 *
 * CENTRAL JUDGMENT (business invariants, see definition.ts): a Financial
 * Record under the mandated 7-year window or an active legal hold must
 * never be purged, regardless of what the retention policy currently
 * says; a User-Deletion-Request record past its own mandated erasure
 * deadline must not be left retained merely because fixing deletion
 * feels riskier than doing nothing; different data classes have
 * genuinely different retention requirements and must not be treated
 * uniformly. deletionPolicyMode="financial-class-corrected" +
 * legalHoldEnforcement="enforced" is the TARGETED, correctly-scoped fix:
 * it stops further Financial Records loss AND independently closes the
 * legal-hold gap, without ever touching the User-Deletion-Request or
 * Ephemeral Log classes — those two controls are entirely independent
 * of deletionPolicyMode/legalHoldEnforcement and are left at their
 * default "enforced" value by this strategy, which is exactly why every
 * rule below that represents this strategy must NOT additionally
 * constrain userDeletionRequestProcessing/ephemeralLogPurge — doing so
 * would be the exact default-value completeness bug this batch must
 * avoid (see the per-combination audit in this scenario's completion
 * report).
 *
 * REQUIRED TEMPTING-BUT-UNSAFE TRAP: emergencyHaltAllDeletion=
 * "all-classes-paused" looks maximally cautious the instant the
 * Financial Records problem is discovered — it DOES stop further
 * Financial Records loss (nothing more is purged from Archive while
 * paused) — but it ALSO halts the completely unrelated, correctly-
 * configured User-Deletion-Request erasure jobs (modeled as a forced
 * side effect on userDeletionRequestProcessing, see rules below),
 * which keeps piling up a brand-new, independent compliance violation
 * on a data class that was never part of the actual problem. This is
 * never acceptable regardless of how quickly it stops the Financial
 * Records bleeding, and is checked ahead of the generic unmitigated
 * baseline below.
 *
 * ALTERNATE STRONG PATHS (both reach OPTIMAL once genuinely engaged and
 * drained; see the alternate-strong-path audit in the completion
 * report):
 *   A. Targeted per-class correction: deletionPolicyMode=
 *      "financial-class-corrected" + legalHoldEnforcement="enforced",
 *      applied directly (fixRolloutMode default, auditSequencing
 *      default) — stops the bleeding the fastest, at the real cost of
 *      never establishing a verified picture of exactly which records
 *      were affected before fixing (operationalEfficiency/dataIntegrity
 *      treat this honestly, see scoring.ts).
 *   B. Halt-and-audit-then-selective-resume: audit-first sequencing
 *      PLUS validate-first rollout — materially slower to reach the
 *      same targeted correction, but establishes an accurate,
 *      validated picture of the damage and the fix before either ever
 *      touches production again. Both reach the same terminal
 *      compliance state once drained; B is the more thorough,
 *      slower-but-fully-audited alternate route (recovery dimension
 *      honestly scores it as slower; dataIntegrity/operationalEfficiency
 *      reward its audit/validation completeness).
 *
 * NO SCALE-X-OVERLOAD-Y MECHANIC: nothing in this scenario scales a
 * service and then overloads a downstream dependency — every lever here
 * either corrects a policy's scope, enforces (or fails to enforce) a
 * hold, sequences an investigation before/after a fix, or halts/resumes
 * per-class processing. No new bottleneck is ever created anywhere.
 */
export const dataRetentionPolicyMisconfigurationRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAPS — checked first: win regardless of every
  // other control, because a live retention/deletion violation on
  // EITHER data class is never acceptable however healthy
  // Application/Event Store look.
  // ══════════════════════════════════════════════════════════════════

  // Panic-pause-all-classes trap, sustained: the scenario's primary
  // required trap. Stops the Financial Records bleeding, but creates an
  // independent, equally-real User-Deletion-Request deadline breach on
  // a class that was never broken.
  {
    id: "panic-pause-all-classes-sustained",
    when: {
      triggerEquals: { retentionMisconfigured: true, sustainedMisconfiguration: true },
      controlEquals: { [EMERGENCY_HALT_ALL_DELETION_KEY]: "all-classes-paused" },
    },
    incidentState: "panic-pause-all-classes-sustained",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 180,
      financialRecordsComplianceRatePercent: 62,
      financialRecordsComplianceTier: "violated",
      financialRecordsRetentionStatus: "actively-violated",
      userDeletionRequestOverdueCount: 140,
      userDeletionRequestComplianceRatePercent: 40,
      userDeletionRequestRetentionStatus: "deadline-breached",
      ephemeralLogExcessStorageGb: 95,
      affectedRecordAuditStatus: "not-started",
      correctionValidationStatus: "not-applicable",
      complianceSeverity: "critical",
    },
    componentHealth: bothViolatedHealth,
  },
  {
    id: "panic-pause-all-classes-active",
    when: {
      triggerEquals: { retentionMisconfigured: true },
      controlEquals: { [EMERGENCY_HALT_ALL_DELETION_KEY]: "all-classes-paused" },
    },
    incidentState: "panic-pause-all-classes-active",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 60,
      financialRecordsComplianceRatePercent: 85,
      financialRecordsComplianceTier: "violated",
      financialRecordsRetentionStatus: "actively-violated",
      userDeletionRequestOverdueCount: 35,
      userDeletionRequestComplianceRatePercent: 70,
      userDeletionRequestRetentionStatus: "deadline-breached",
      ephemeralLogExcessStorageGb: 25,
      affectedRecordAuditStatus: "not-started",
      correctionValidationStatus: "not-applicable",
      complianceSeverity: "critical",
    },
    componentHealth: bothViolatedHealth,
  },

  // Legal-hold-breach trap: an INDEPENDENT unsafe lever. Even once the
  // main Financial Records policy is corrected, leaving legalHoldEnforcement
  // "unenforced" still purges records under active legal hold the moment
  // their nominal 7-year window elapses — this is never acceptable, and
  // proves the trap is not reachable only through the main policy mode.
  {
    id: "legal-hold-breach-trap",
    when: {
      triggerEquals: { retentionMisconfigured: true, sustainedMisconfiguration: true },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "unenforced",
      },
    },
    incidentState: "legal-hold-breach-trap",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 95,
      financialRecordsComplianceRatePercent: 80,
      financialRecordsComplianceTier: "violated",
      financialRecordsRetentionStatus: "actively-violated",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "in-progress",
      correctionValidationStatus: "unvalidated-direct-to-production",
      complianceSeverity: "critical",
    },
    componentHealth: archiveViolatedHealth,
  },

  // Wrong-class-suspension trap: a candidate who directly suspends
  // User-Deletion-Request processing (without the fleet-wide halt)
  // creates the exact same independent violation on its own — proving
  // the trap is not only reachable via emergencyHaltAllDeletion.
  {
    id: "wrong-class-suspended-sustained",
    when: {
      triggerEquals: { retentionMisconfigured: true, sustainedMisconfiguration: true },
      controlEquals: {
        [EMERGENCY_HALT_ALL_DELETION_KEY]: "off",
        [USER_DELETION_REQUEST_PROCESSING_KEY]: "suspended",
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
      },
    },
    incidentState: "wrong-class-suspended-sustained",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 95,
      financialRecordsComplianceRatePercent: 80,
      financialRecordsComplianceTier: "partial",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 150,
      userDeletionRequestComplianceRatePercent: 35,
      userDeletionRequestRetentionStatus: "deadline-breached",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "in-progress",
      correctionValidationStatus: "unvalidated-direct-to-production",
      complianceSeverity: "critical",
    },
    componentHealth: dataLakeViolatedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE FAMILY — deletionPolicyMode corrected + legalHoldEnforcement
  // enforced + the other classes left untouched (their default
  // "enforced"/"enforced" values). This is Alternate Strong Path A
  // (direct) when auditSequencing/fixRolloutMode are left at THEIR
  // defaults too, and Alternate Strong Path B (audit-then-validate)
  // when both are explicitly set to their safer-but-slower values.
  // Every combination of {auditSequencing × fixRolloutMode} below is
  // enumerated explicitly at each drain stage specifically so that
  // leaving either at its untouched default never falls through to an
  // unrelated baseline/unsafe rule purely from elapsed time — this is
  // the batch's binding default-value path completeness requirement.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: full recovery, audited + validated (Path B, slower,
  // most thorough).
  {
    id: "fully-recovered-audited-validated",
    when: {
      triggerEquals: { retentionMisconfigured: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
        [AUDIT_SEQUENCING_KEY]: "audit-first",
        [FIX_ROLLOUT_MODE_KEY]: "validate-first",
      },
    },
    incidentState: "fully-recovered-audited-validated",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 40,
      financialRecordsComplianceRatePercent: 100,
      financialRecordsComplianceTier: "full",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "completed",
      correctionValidationStatus: "validated",
      complianceSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── Ephemeral-log purge suspended directly (not via the fleet-wide
  // halt) on top of an otherwise fully safe, fully recovered Path A
  // (direct) correction. ephemeralLogPurge has no compliance floor of
  // its own — this is never a violation — but it is a real,
  // independent, non-dead control: storage cost grows exactly as it
  // would under the panic-halt trap's ephemeral-log side effect, while
  // every compliance field stays fully healthy, proving suspending
  // logs alone (unlike the fleet-wide halt) never touches
  // User-Deletion-Request compliance. MUST be listed BEFORE
  // fully-recovered-direct-unvalidated below (more specific — that
  // rule does not constrain ephemeralLogPurge, so without this
  // ordering a candidate who additionally suspended log purging on top
  // of Path A would still match the less-specific rule first and the
  // real, distinct storage-cost consequence of that extra choice would
  // be silently absorbed rather than made visible).
  {
    id: "fully-recovered-direct-unvalidated-logs-suspended",
    when: {
      triggerEquals: { retentionMisconfigured: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
        [AUDIT_SEQUENCING_KEY]: "fix-immediately",
        [FIX_ROLLOUT_MODE_KEY]: "direct-to-production",
        [EPHEMERAL_LOG_PURGE_KEY]: "suspended",
      },
    },
    incidentState: "fully-recovered-direct-unvalidated-logs-suspended",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 95,
      financialRecordsComplianceRatePercent: 100,
      financialRecordsComplianceTier: "full",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 70,
      affectedRecordAuditStatus: "never-completed",
      correctionValidationStatus: "unvalidated-direct-to-production",
      complianceSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: full recovery, direct + unvalidated (Path A, fastest).
  // Without this rule, a candidate who used the fastest correct
  // strategy (deletionPolicyMode + legalHoldEnforcement only, leaving
  // auditSequencing and fixRolloutMode at their untouched defaults)
  // would fall through every audit/validate-gated rule in this table —
  // every one of which explicitly requires "audit-first" and/or
  // "validate-first" — all the way to the unmitigated baseline, exactly
  // the default-value completeness bug this batch must avoid.
  {
    id: "fully-recovered-direct-unvalidated",
    when: {
      triggerEquals: { retentionMisconfigured: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
        [AUDIT_SEQUENCING_KEY]: "fix-immediately",
        [FIX_ROLLOUT_MODE_KEY]: "direct-to-production",
      },
    },
    incidentState: "fully-recovered-direct-unvalidated",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 95,
      financialRecordsComplianceRatePercent: 100,
      financialRecordsComplianceTier: "full",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "never-completed",
      correctionValidationStatus: "unvalidated-direct-to-production",
      complianceSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: full recovery, audited but unvalidated (mixed — audit
  // completed before the fix, but the corrected rule itself was rolled
  // straight to production without a validation pass). A real, distinct
  // combination from either pure path above: auditSequencing left at
  // "audit-first" while fixRolloutMode stays at its untouched default
  // "direct-to-production". Covered explicitly for the same default-
  // value completeness reason as fully-recovered-direct-unvalidated.
  {
    id: "fully-recovered-audited-unvalidated",
    when: {
      triggerEquals: { retentionMisconfigured: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
        [AUDIT_SEQUENCING_KEY]: "audit-first",
        [FIX_ROLLOUT_MODE_KEY]: "direct-to-production",
      },
    },
    incidentState: "fully-recovered-audited-unvalidated",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 70,
      financialRecordsComplianceRatePercent: 100,
      financialRecordsComplianceTier: "full",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "completed",
      correctionValidationStatus: "unvalidated-direct-to-production",
      complianceSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: full recovery, unaudited but validated (mixed — the
  // fix itself was validated before rollout, but no affected-record
  // audit was ever run). auditSequencing left at its untouched default
  // "fix-immediately" while fixRolloutMode is explicitly
  // "validate-first". Covered for the same completeness reason.
  {
    id: "fully-recovered-unaudited-validated",
    when: {
      triggerEquals: { retentionMisconfigured: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
        [AUDIT_SEQUENCING_KEY]: "fix-immediately",
        [FIX_ROLLOUT_MODE_KEY]: "validate-first",
      },
    },
    incidentState: "fully-recovered-unaudited-validated",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 65,
      financialRecordsComplianceRatePercent: 100,
      financialRecordsComplianceTier: "full",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "never-completed",
      correctionValidationStatus: "validated",
      complianceSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE tiers: targeted correction engaged, draining but not
  // yet fully recovered — Financial Records are no longer being
  // actively purged wrong (financialRecordsRetentionStatus already
  // "compliant"), but the fleet-wide compliance RATE has not yet fully
  // re-validated every in-scope record against the corrected rule. Each
  // of the four auditSequencing x fixRolloutMode combinations is
  // enumerated at this drain stage too, for the identical default-value
  // completeness reason as the OPTIMAL tier above — a candidate who
  // reaches drainWindow1Elapsed (but not yet fully-recovered) with
  // either control still at its untouched default must land here, not
  // fall through to baseline.
  {
    id: "draining-window1-audited-validated",
    when: {
      triggerEquals: {
        retentionMisconfigured: true,
        sustainedMisconfiguration: true,
        drainWindow1Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
        [AUDIT_SEQUENCING_KEY]: "audit-first",
        [FIX_ROLLOUT_MODE_KEY]: "validate-first",
      },
    },
    incidentState: "draining-window1-audited-validated",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 40,
      financialRecordsComplianceRatePercent: 92,
      financialRecordsComplianceTier: "partial",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "completed",
      correctionValidationStatus: "validated",
      complianceSeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window1-direct-unvalidated",
    when: {
      triggerEquals: {
        retentionMisconfigured: true,
        sustainedMisconfiguration: true,
        drainWindow1Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
        [AUDIT_SEQUENCING_KEY]: "fix-immediately",
        [FIX_ROLLOUT_MODE_KEY]: "direct-to-production",
      },
    },
    incidentState: "draining-window1-direct-unvalidated",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 95,
      financialRecordsComplianceRatePercent: 88,
      financialRecordsComplianceTier: "partial",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "never-completed",
      correctionValidationStatus: "unvalidated-direct-to-production",
      complianceSeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window1-audited-unvalidated",
    when: {
      triggerEquals: {
        retentionMisconfigured: true,
        sustainedMisconfiguration: true,
        drainWindow1Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
        [AUDIT_SEQUENCING_KEY]: "audit-first",
        [FIX_ROLLOUT_MODE_KEY]: "direct-to-production",
      },
    },
    incidentState: "draining-window1-audited-unvalidated",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 70,
      financialRecordsComplianceRatePercent: 90,
      financialRecordsComplianceTier: "partial",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "completed",
      correctionValidationStatus: "unvalidated-direct-to-production",
      complianceSeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window1-unaudited-validated",
    when: {
      triggerEquals: {
        retentionMisconfigured: true,
        sustainedMisconfiguration: true,
        drainWindow1Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
        [AUDIT_SEQUENCING_KEY]: "fix-immediately",
        [FIX_ROLLOUT_MODE_KEY]: "validate-first",
      },
    },
    incidentState: "draining-window1-unaudited-validated",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 65,
      financialRecordsComplianceRatePercent: 90,
      financialRecordsComplianceTier: "partial",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "never-completed",
      correctionValidationStatus: "validated",
      complianceSeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ── Just-engaged tick-zero proof: targeted correction flipped this
  // instant (no elapsed drain window yet, not even drainWindow1) — the
  // fleet-wide compliance rate is exactly what it is at the moment the
  // fix landed, proving the drain is not instant. Deliberately has NO
  // auditSequencing/fixRolloutMode constraint (it matches regardless of
  // their value) since at tick-zero the compliance RATE depends only on
  // whether the policy/legal-hold fix is engaged, never on how the fix
  // was sequenced — that only affects auditStatus/validationStatus
  // (still read correctly off the live controls by the generic
  // candidate-ui, not faked here) and how fast later rules' numbers
  // differ.
  {
    id: "just-corrected-no-drain-yet",
    when: {
      triggerEquals: {
        retentionMisconfigured: true,
        sustainedMisconfiguration: true,
        drainWindow1Elapsed: false,
      },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
      },
    },
    incidentState: "just-corrected-no-drain-yet",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 95,
      financialRecordsComplianceRatePercent: 80,
      financialRecordsComplianceTier: "partial",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "in-progress",
      correctionValidationStatus: "unvalidated-direct-to-production",
      complianceSeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ── Corrected before sustained-misconfiguration even fires (fast
  // candidate reaction) — same "financial-class-corrected" +
  // "enforced" gate, but matched before the sustained-exposure window,
  // so the wrongly-deleted count is much smaller. Deliberately placed
  // after every sustained-gated safe rule above (more specific trigger
  // set wins) but before the generic unmitigated baseline below.
  {
    id: "corrected-before-sustained",
    when: {
      triggerEquals: { retentionMisconfigured: true },
      controlEquals: {
        [DELETION_POLICY_MODE_KEY]: "financial-class-corrected",
        [LEGAL_HOLD_ENFORCEMENT_KEY]: "enforced",
      },
    },
    incidentState: "corrected-before-sustained",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 18,
      financialRecordsComplianceRatePercent: 90,
      financialRecordsComplianceTier: "partial",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "in-progress",
      correctionValidationStatus: "unvalidated-direct-to-production",
      complianceSeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // NO MITIGATION — deletionPolicyMode left "misconfigured" (whether or
  // not legalHoldEnforcement/auditSequencing/other controls were
  // touched; none of them stop the core Financial Records bleeding on
  // their own). A real, unaddressed, live retention violation.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-misconfigured",
    when: { triggerEquals: { retentionMisconfigured: true, sustainedMisconfiguration: true } },
    incidentState: "baseline-sustained-misconfigured",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 420,
      financialRecordsComplianceRatePercent: 55,
      financialRecordsComplianceTier: "violated",
      financialRecordsRetentionStatus: "actively-violated",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "not-started",
      correctionValidationStatus: "not-applicable",
      complianceSeverity: "critical",
    },
    componentHealth: archiveViolatedHealth,
  },
  {
    id: "baseline-misconfigured",
    when: { triggerEquals: { retentionMisconfigured: true } },
    incidentState: "baseline-misconfigured",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 55,
      financialRecordsComplianceRatePercent: 78,
      financialRecordsComplianceTier: "violated",
      financialRecordsRetentionStatus: "actively-violated",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "not-started",
      correctionValidationStatus: "not-applicable",
      complianceSeverity: "warning",
    },
    componentHealth: archiveViolatedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      applicationUptimePercent: 99.98,
      eventStoreWriteSuccessRate: 100,
      financialRecordsWronglyDeletedCount: 0,
      financialRecordsComplianceRatePercent: 100,
      financialRecordsComplianceTier: "full",
      financialRecordsRetentionStatus: "compliant",
      userDeletionRequestOverdueCount: 0,
      userDeletionRequestComplianceRatePercent: 100,
      userDeletionRequestRetentionStatus: "compliant",
      ephemeralLogExcessStorageGb: 0,
      affectedRecordAuditStatus: "not-started",
      correctionValidationStatus: "not-applicable",
      complianceSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
