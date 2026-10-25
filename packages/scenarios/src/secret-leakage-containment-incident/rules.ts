import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  AUDIT_LOG_REVIEW_KEY,
  DEPENDENT_COHORT_MIGRATION_KEY,
  EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
  INVESTIGATION_STATUS_KEY,
  MISUSE_MONITORING_KEY,
  NEW_CREDENTIAL_ISSUED_KEY,
  REVOCATION_SCOPE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  applications: "healthy",
  "secret-manager": "healthy",
  "ci-cd": "healthy",
  logging: "healthy",
  "external-integrations": "healthy",
};

const trustedExposedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "secret-manager": "degraded",
};

const monitoredHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "secret-manager": "degraded",
};

const brokenIntegrationsHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "secret-manager": "degraded",
  "external-integrations": "critical",
  applications: "critical",
};

const stagedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "secret-manager": "degraded",
};

/**
 * Authored rule table for Secret Leakage Containment Incident, ordered
 * most-specific-first: unsafe traps first (they win regardless of
 * every other control — continued-trust exposure and unsequenced
 * broad revocation are both never acceptable no matter how healthy
 * other metrics look), followed by the safe cohort-staged rotation
 * progression (most specific, since it additionally constrains
 * revocationScope/newCredentialIssued/dependentCohortMigration), then
 * the legitimate monitored-containment catch-all, and finally the
 * baseline/healthy-default fallback.
 *
 * ROOT CAUSE: a credential used by Applications and External
 * Integrations is found in plaintext in a Logging record and in a
 * CI/CD build artifact (timed-events.ts's exposure-identified). This is
 * NOT an availability regression of any kind — applicationRequestSuccessRate
 * and externalIntegrationSuccessRate both start and stay healthy on
 * their own; the only way either ever degrades is as a direct,
 * self-inflicted consequence of the broad-immediate-revocation trap
 * below. No "scale service" mechanic appears anywhere in this rule
 * table, by design (phase-6e-strategy-spec.md section 5/6's explicit
 * requirement for this scenario).
 *
 * ── HISTORICAL SECURITY DAMAGE MODEL (phase-6e-strategy-spec.md
 * section 11/18, binding) ────────────────────────────────────────────
 * suspectedExposedCredentialUseCount is modeled the same way Identity
 * Platform Degradation's highRiskActionsAuthenticatedWithoutMfaCount
 * and Authorization Policy Rollout Failure's
 * cumulativeUnauthorizedAccessCount model their own non-resetting
 * historical counters: as a sequence of authored snapshots keyed to
 * elapsed trigger-time windows (exposureIdentified / sustainedExposure),
 * not as runtime arithmetic the engine has no mechanism for (rule
 * `values` are a complete authored snapshot per tick, never an
 * accumulator derived from a previous tick's value — see tick.ts).
 * While exposedCredentialTrustMode stays "fully-trusted" after exposure
 * was identified, this count climbs at each later-firing elapsed-time
 * trigger for the SAME "still fully trusted" rule family. The moment
 * the trust mode moves to "monitored" or "revoked", the live
 * incidentState moves to a different rule family that always carries
 * suspectedExposedCredentialUseCount: 0 going forward for the LIVE
 * value — this is the same limitation Identity Platform Degradation
 * and Authorization Policy Rollout Failure accept for their own live
 * damage counters. What is genuinely non-resetting and irreversible is
 * state.peaks.peakValues.suspectedExposedCredentialUseCount (an
 * engine-tracked max-ever value, see definition.ts's numericWatchFields
 * with trackPeak: true) — a candidate who left the credential
 * fully-trusted for several real minutes and then contained it still
 * shows that real peak exposure count in the completed attempt's
 * scoring, never silently erased by containing it afterward.
 *
 * ── THE TWO FORBIDDEN LEVERS ─────────────────────────────────────────
 * 1. exposedCredentialTrustMode = "fully-trusted" after exposure was
 *    identified (the "do nothing" trap): availability metrics stay
 *    perfect (nothing about this lever touches applicationRequestSuccessRate
 *    or externalIntegrationSuccessRate at all) while
 *    suspectedExposedCredentialUseCount climbs every tick, compounding
 *    further once sustainedExposure fires. This can NEVER satisfy
 *    either completion condition, however long it runs, and crosses
 *    into automatic failure if left active long enough.
 * 2. revocationScope = "broad-immediate" while dependentCohortMigration
 *    is not yet "cohort-a-and-b-migrated" (the unsequenced-revocation
 *    trap): this DOES fix the security problem instantly
 *    (credentialContainmentStatus becomes "broad-revoked-unsequenced",
 *    suspectedExposedCredentialUseCount stops climbing) but breaks
 *    every not-yet-migrated dependent system's calls through
 *    External Integrations immediately — a real, measurable,
 *    self-inflicted, AVOIDABLE outage that cohort-staged sequencing
 *    would never have created.
 *
 * ── SEQUENCING (phase-6e-strategy-spec.md section 6, this scenario's
 * primary judgment) ──────────────────────────────────────────────────
 * The safe path is: narrow/monitor first (exposedCredentialTrustMode=
 * monitored, misuseMonitoring=true) -> issue a new credential
 * (newCredentialIssued=true) -> stage rotation by dependent-system
 * cohort as each cohort's real elapsed migration window completes
 * (revocationScope=cohort-staged) -> only fully revoke broadly once
 * dependentCohortMigration reaches "cohort-a-and-b-migrated". Skipping
 * straight to broad-immediate revocation without migrated cohorts is
 * the unsafe shortcut; skipping investigation/monitoring and leaving
 * the credential fully-trusted indefinitely is the opposite unsafe
 * shortcut. Both are real, distinct, authored traps below.
 */
export const secretLeakageContainmentIncidentRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE TRAP #1 — "do nothing": the exposed credential is still
  // being treated as fully trusted. Checked first; wins regardless of
  // every other control, because continuing to trust a believed-
  // exposed credential is never acceptable per this scenario's
  // explicit security invariant.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "fully-trusted-sustained-exposure",
    when: {
      triggerEquals: { exposureIdentified: true, sustainedExposure: true },
      controlEquals: { [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "fully-trusted" },
    },
    incidentState: "fully-trusted-sustained-exposure",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "unknown",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 46,
      credentialContainmentStatus: "trusted",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: trustedExposedHealth,
  },
  {
    id: "fully-trusted-baseline-exposure",
    when: {
      triggerEquals: { exposureIdentified: true },
      controlEquals: { [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "fully-trusted" },
    },
    incidentState: "fully-trusted-baseline-exposure",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "unknown",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 12,
      credentialContainmentStatus: "trusted",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: trustedExposedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNSAFE TRAP #2 — unsequenced broad-immediate revocation. Breaks
  // real dependent systems with no replacement in place. Listed before
  // the safe cohort-staged family so a candidate who sets
  // broad-immediate at ANY point before full migration is always
  // caught here regardless of what newCredentialIssued/investigation
  // happen to say. Two sub-variants, most-specific first: zero cohorts
  // migrated (the worst — total breakage) vs. one cohort migrated (one
  // cohort survives, the other — the critical, not-yet-migrated
  // integration the business invariant names — still breaks).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "broad-immediate-revocation-zero-migrated",
    when: {
      triggerEquals: { exposureIdentified: true },
      controlEquals: {
        [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "revoked",
        [REVOCATION_SCOPE_KEY]: "broad-immediate",
        [DEPENDENT_COHORT_MIGRATION_KEY]: "none",
      },
    },
    incidentState: "broad-immediate-revocation-zero-migrated",
    values: {
      applicationRequestSuccessRate: 42,
      externalIntegrationSuccessRate: 8,
      externalIntegrationStatus: "critical",
      blastRadiusStatus: "unknown",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "broad-revoked-unsequenced",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: brokenIntegrationsHealth,
  },
  {
    id: "broad-immediate-revocation-cohort-a-migrated",
    when: {
      triggerEquals: { exposureIdentified: true },
      controlEquals: {
        [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "revoked",
        [REVOCATION_SCOPE_KEY]: "broad-immediate",
        [DEPENDENT_COHORT_MIGRATION_KEY]: "cohort-a-migrated",
      },
    },
    incidentState: "broad-immediate-revocation-cohort-a-migrated",
    values: {
      applicationRequestSuccessRate: 68,
      externalIntegrationSuccessRate: 45,
      externalIntegrationStatus: "critical",
      blastRadiusStatus: "identified",
      migratedCohortCount: 1,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "broad-revoked-unsequenced",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: brokenIntegrationsHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE COHORT-STAGED ROTATION PROGRESSION — requires a genuine new
  // credential (newCredentialIssued=true) AND real elapsed per-cohort
  // migration time (recovery-lag) AND revocationScope=cohort-staged.
  // Reachable only in increasing order of migratedCohortCount; listed
  // most-complete-first so first-match-wins routes a fully-migrated
  // candidate to the OPTIMAL rule rather than being shadowed by a
  // less-specific partial-progress rule.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: every known cohort has migrated AND the old credential
  // has been fully, safely revoked. Zero avoidable breakage, the
  // credential is no longer a risk, and the live
  // suspectedExposedCredentialUseCount reads 0 (the historical PEAK
  // record — see module doc comment and definition.ts — is what
  // survives, not this live snapshot).
  {
    id: "fully-contained-reviewed",
    when: {
      triggerEquals: { exposureIdentified: true, cohortBMigrationWindowElapsed: true },
      controlEquals: {
        [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "revoked",
        [REVOCATION_SCOPE_KEY]: "cohort-staged",
        [NEW_CREDENTIAL_ISSUED_KEY]: true,
        [DEPENDENT_COHORT_MIGRATION_KEY]: "cohort-a-and-b-migrated",
        [AUDIT_LOG_REVIEW_KEY]: true,
      },
    },
    incidentState: "fully-contained-reviewed",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "identified",
      migratedCohortCount: 2,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "fully-contained",
      auditReviewStatus: "reviewed",
    },
    componentHealth: healthyHealth,
  },
  // Fully contained, but the historical audit review pass was never
  // done: the live security posture is genuinely safe (same
  // credentialContainmentStatus, same zero breakage), but the
  // auditability business invariant is not fully satisfied — a real,
  // distinct, authored gap proving auditLogReviewCompleted is not a
  // dead control. This is the scenario's ACCEPTABLE tier: safe to hand
  // back, but not the complete, fully-audited resolution.
  {
    id: "fully-contained-unreviewed",
    when: {
      triggerEquals: { exposureIdentified: true, cohortBMigrationWindowElapsed: true },
      controlEquals: {
        [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "revoked",
        [REVOCATION_SCOPE_KEY]: "cohort-staged",
        [NEW_CREDENTIAL_ISSUED_KEY]: true,
        [DEPENDENT_COHORT_MIGRATION_KEY]: "cohort-a-and-b-migrated",
        [AUDIT_LOG_REVIEW_KEY]: false,
      },
    },
    incidentState: "fully-contained-unreviewed",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "identified",
      migratedCohortCount: 2,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "fully-contained",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: healthyHealth,
  },

  // ── Cohort A migrated, staged revocation engaged for Cohort A only,
  // Cohort B still legitimately on the old credential (not yet
  // broken — cohort-staged, unlike broad-immediate, only revokes for
  // migrated cohorts). Real, distinct, safe intermediate progress.
  {
    id: "staged-rotation-cohort-a-only",
    when: {
      triggerEquals: { exposureIdentified: true, cohortAMigrationWindowElapsed: true },
      controlEquals: {
        [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "revoked",
        [REVOCATION_SCOPE_KEY]: "cohort-staged",
        [NEW_CREDENTIAL_ISSUED_KEY]: true,
        [DEPENDENT_COHORT_MIGRATION_KEY]: "cohort-a-migrated",
      },
    },
    incidentState: "staged-rotation-cohort-a-only",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "identified",
      migratedCohortCount: 1,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "staged-rotation",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: stagedHealth,
  },

  // ── Cohort-staged revocation requested and dependentCohortMigration
  // has been marked "cohort-a-migrated", but the real elapsed Cohort-A
  // migration window has NOT yet fired (tick-zero proof that flipping
  // the migration control does not instantly migrate anyone — the
  // same recovery-lag guarantee Identity Platform Degradation's
  // relief-just-engaged rule proves for session-store relief). Listed
  // before the plain "no cohort migrated yet" rule since it is the
  // more specific match (dependentCohortMigration is NOT "none" here).
  {
    id: "staged-rotation-cohort-a-claimed-not-yet-elapsed",
    when: {
      triggerEquals: { exposureIdentified: true, cohortAMigrationWindowElapsed: false },
      controlEquals: {
        [REVOCATION_SCOPE_KEY]: "cohort-staged",
        [NEW_CREDENTIAL_ISSUED_KEY]: true,
        [DEPENDENT_COHORT_MIGRATION_KEY]: "cohort-a-migrated",
      },
    },
    incidentState: "staged-rotation-cohort-a-claimed-not-yet-elapsed",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "identified",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "monitored",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: monitoredHealth,
  },
  // Same tick-zero proof for the final cohort-B step: "cohort-a-and-b-
  // migrated" claimed but the real elapsed Cohort-B migration window
  // has NOT yet fired. Listed before the OPTIMAL/ACCEPTABLE rules
  // above would otherwise require cohortBMigrationWindowElapsed:true,
  // so this is naturally unreachable by those more specific rules —
  // listed here as an explicit, named state rather than silently
  // falling through to a less-specific rule.
  {
    id: "staged-rotation-cohort-b-claimed-not-yet-elapsed",
    when: {
      triggerEquals: { exposureIdentified: true, cohortBMigrationWindowElapsed: false },
      controlEquals: {
        [REVOCATION_SCOPE_KEY]: "cohort-staged",
        [NEW_CREDENTIAL_ISSUED_KEY]: true,
        [DEPENDENT_COHORT_MIGRATION_KEY]: "cohort-a-and-b-migrated",
      },
    },
    incidentState: "staged-rotation-cohort-b-claimed-not-yet-elapsed",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "identified",
      migratedCohortCount: 1,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "staged-rotation",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: stagedHealth,
  },

  // ── New credential issued, cohort-staged mode selected, but no
  // cohort has actually completed migration yet (dependentCohortMigration
  // is still "none") — the old credential therefore remains live and
  // trusted for everyone, but with a genuine replacement now available
  // and a real plan declared. Real, distinct, authored proof that
  // issuing a credential alone does not instantly migrate anyone
  // (recovery lag).
  {
    id: "new-credential-issued-no-cohort-migrated-yet",
    when: {
      triggerEquals: { exposureIdentified: true },
      controlEquals: {
        [REVOCATION_SCOPE_KEY]: "cohort-staged",
        [NEW_CREDENTIAL_ISSUED_KEY]: true,
        [DEPENDENT_COHORT_MIGRATION_KEY]: "none",
      },
    },
    incidentState: "new-credential-issued-no-cohort-migrated-yet",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "identified",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "monitored",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: monitoredHealth,
  },

  // ── Cohort migration CLAIMED without a genuine new credential ever
  // having been issued: dependentCohortMigration says cohorts have
  // moved, but newCredentialIssued is false, so there is nothing for
  // them to have genuinely migrated to. Treated identically to "no
  // cohort migrated" for safety purposes — proves newCredentialIssued
  // is a real prerequisite, not a dead control, and that a candidate
  // cannot shortcut recovery lag by just flipping the migration
  // control without ever actually issuing a replacement.
  {
    id: "cohort-migration-claimed-without-new-credential",
    when: {
      triggerEquals: { exposureIdentified: true },
      controlEquals: { [NEW_CREDENTIAL_ISSUED_KEY]: false, [REVOCATION_SCOPE_KEY]: "cohort-staged" },
    },
    incidentState: "cohort-migration-claimed-without-new-credential",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "identified",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "monitored",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: monitoredHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // LEGITIMATE MONITORED CONTAINMENT — a real, bounded, intentionally
  // incomplete tradeoff. The credential is still live and in use (so
  // nothing breaks) but active usage monitoring is engaged and no
  // unsequenced revocation has been attempted. This is the required
  // "narrow/monitor first" first step of the safe sequence. Listed
  // AFTER the cohort-staged rotation progression above: those rules
  // are all strictly more specific (they additionally require
  // revocationScope=cohort-staged and/or newCredentialIssued/
  // dependentCohortMigration progress), so first-match-wins correctly
  // routes a candidate who has moved past plain monitoring into
  // genuine staged rotation to the more specific rule, while a
  // candidate who has only narrowed trust and turned on monitoring —
  // without yet touching revocationScope/newCredentialIssued/
  // dependentCohortMigration at all — falls through to these.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "monitored-scope-identified",
    when: {
      triggerEquals: { exposureIdentified: true },
      controlEquals: {
        [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "monitored",
        [MISUSE_MONITORING_KEY]: true,
        [INVESTIGATION_STATUS_KEY]: "scope-identified",
      },
    },
    incidentState: "monitored-scope-identified",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "identified",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "monitored",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: monitoredHealth,
  },
  // Monitored but investigation never completed: the credential is
  // genuinely being watched (no new historical damage accrues), but
  // the blast radius remains unknown — a real, distinct gap versus the
  // scope-identified state above, proving investigationStatus is not a
  // dead control: a candidate in this state cannot yet safely begin
  // cohort-staged revocation, since the cohorts themselves are not
  // confirmed.
  {
    id: "monitored-investigation-not-started",
    when: {
      triggerEquals: { exposureIdentified: true },
      controlEquals: {
        [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "monitored",
        [MISUSE_MONITORING_KEY]: true,
        [INVESTIGATION_STATUS_KEY]: "not-started",
      },
    },
    incidentState: "monitored-investigation-not-started",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "unknown",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "monitored",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: monitoredHealth,
  },
  // Monitored mode selected but misuseMonitoring never actually turned
  // on: the trust mode says "monitored" but nothing is really watching
  // — real, distinct, authored cost (usage goes undetected, so the
  // historical count cannot be confidently tracked even though the
  // credential itself is no longer being treated as fully trusted),
  // proving misuseMonitoring is not a dead control.
  {
    id: "monitored-without-active-monitoring",
    when: {
      triggerEquals: { exposureIdentified: true },
      controlEquals: { [EXPOSED_CREDENTIAL_TRUST_MODE_KEY]: "monitored", [MISUSE_MONITORING_KEY]: false },
    },
    incidentState: "monitored-without-active-monitoring",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "unknown",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "monitored",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: monitoredHealth,
  },

  // ── Default/fallback: before the incident begins. ──────────────────
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      applicationRequestSuccessRate: 99.9,
      externalIntegrationSuccessRate: 99.8,
      externalIntegrationStatus: "normal",
      blastRadiusStatus: "unknown",
      migratedCohortCount: 0,
      suspectedExposedCredentialUseCount: 0,
      credentialContainmentStatus: "trusted",
      auditReviewStatus: "unreviewed",
    },
    componentHealth: healthyHealth,
  },
];
