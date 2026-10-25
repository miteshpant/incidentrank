import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How the believed-exposed credential is currently being treated.
 * "fully-trusted" (default/root-cause state) means the credential
 * continues to be accepted everywhere exactly as before the exposure
 * was identified — this is the scenario's first forbidden lever
 * (business invariant: "continuing to treat a believed-exposed
 * credential as fully trusted while investigation drags on is never
 * acceptable"). "monitored" narrows nothing by itself but pairs with
 * misuseMonitoring to watch for suspicious use while a real
 * containment plan is built — a legitimate, bounded first response.
 * "revoked" invalidates the credential outright; whether that is SAFE
 * depends entirely on revocationScope/newCredentialIssuance/
 * dependentCohortMigration below — revoking is necessary eventually,
 * but revoking broadly before any cohort has a replacement creates a
 * real, avoidable outage (the scenario's second forbidden lever).
 */
export const EXPOSED_CREDENTIAL_TRUST_MODE_KEY = "exposedCredentialTrustMode";

/**
 * Whether blast-radius investigation (which Applications/External
 * Integrations actually use this credential) has been completed.
 * "not-started" (default) means the real dependent cohorts are not
 * yet known — staging a safe rotation without this is only possible
 * by accident. "scope-identified" means the dependent-system cohorts
 * are known, which is what makes cohort-staged revocation (as opposed
 * to broad-immediate) possible to sequence correctly at all. This
 * directly implements the investigation-sequencing business invariant:
 * investigation is necessary before broad revocation is safe, but
 * (per the SAME invariant) must not become an excuse to delay
 * containment indefinitely — see misuseMonitoring/exposedCredentialTrustMode,
 * which are available and effective even before investigation
 * completes.
 */
export const INVESTIGATION_STATUS_KEY = "investigationStatus";

/**
 * How broadly the credential is revoked once exposedCredentialTrustMode
 * is set to "revoked". "none" (default — paired with any non-revoked
 * trust mode) means no revocation is in flight. "cohort-staged" revokes
 * the old credential only for dependent-system cohorts that have
 * already been migrated to a new credential (dependentCohortMigration)
 * — the scenario's required safe sequencing: narrow/monitor first,
 * THEN stage rotation by cohort, THEN fully revoke. "broad-immediate"
 * revokes for every dependent system at once regardless of migration
 * status — this is the scenario's second forbidden lever: any
 * not-yet-migrated critical integration that was still relying on the
 * old credential breaks immediately, a real and avoidable outage this
 * business invariant explicitly requires sequencing to prevent.
 */
export const REVOCATION_SCOPE_KEY = "revocationScope";

/**
 * Whether a new, clean replacement credential has been issued via the
 * Secret Manager. false (default) means there is nothing yet for any
 * dependent cohort to migrate to — cohort migration cannot genuinely
 * begin without this, regardless of how dependentCohortMigration is
 * set (rules.ts treats "migration" claimed without an issued
 * replacement as not actually having happened). true means a genuine
 * replacement exists and dependent cohorts can be moved onto it one
 * at a time.
 */
export const NEW_CREDENTIAL_ISSUED_KEY = "newCredentialIssued";

/**
 * Which dependent-system cohorts have been migrated onto the new
 * credential so far. "none" (default) — nobody has migrated yet,
 * so the old (believed-exposed) credential is still the only thing
 * every dependent system can use; revoking it now, broadly, would
 * break everything. "cohort-a-migrated" — the first (smaller, lower-
 * risk) cohort has moved over; revoking the old credential is now
 * safe for that cohort specifically but would still break cohort B.
 * "cohort-a-and-b-migrated" — every known dependent cohort has moved
 * over; the old credential can now be fully revoked with zero
 * availability impact. Migration only genuinely progresses with
 * newCredentialIssued=true AND real elapsed migration time per cohort
 * (recovery-lag) — it is never instantaneous.
 */
export const DEPENDENT_COHORT_MIGRATION_KEY = "dependentCohortMigration";

/**
 * Whether active monitoring/alerting on usage of the exposed credential
 * is enabled. false (default) means any continued use of the exposed
 * credential — legitimate or malicious — goes undetected in real time.
 * true enables detection of every use of the exposed credential after
 * exposure was identified, which is the mechanism that feeds the
 * scenario's required historical/cumulative security damage count
 * (suspectedExposedCredentialUseCount) — without this, suspicious use
 * still legitimately occurs (and is still unsafe) but cannot be
 * confidently counted, which is itself a worse audit posture, never a
 * way to make the exposure "not have happened."
 */
export const MISUSE_MONITORING_KEY = "misuseMonitoring";

/**
 * Whether the audit log review of historical exposed-credential usage
 * (CI/CD artifact history, Logging history, Secret Manager access
 * logs) has been completed. false (default) means the full picture of
 * what happened BEFORE and DURING the exposure window has not yet been
 * reconstructed — a real, distinct auditability gap from live
 * monitoring (misuseMonitoring only ever sees usage from the moment it
 * is turned on forward; it can never retroactively explain what
 * already happened before exposure was even identified). true means a
 * deliberate historical review pass has been completed, closing the
 * audit trail — required for the scenario's auditability business
 * invariant ("every use of the exposed credential after exposure was
 * identified must be recorded as an auditable historical fact") to be
 * genuinely satisfiable rather than merely assumed.
 */
export const AUDIT_LOG_REVIEW_KEY = "auditLogReviewCompleted";

export const controls: ControlDefinition[] = [
  {
    key: EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
    allowedValues: ["fully-trusted", "monitored", "revoked"],
    initialValue: "fully-trusted",
  },
  {
    key: INVESTIGATION_STATUS_KEY,
    allowedValues: ["not-started", "scope-identified"],
    initialValue: "not-started",
  },
  {
    key: REVOCATION_SCOPE_KEY,
    allowedValues: ["none", "cohort-staged", "broad-immediate"],
    initialValue: "none",
  },
  {
    key: NEW_CREDENTIAL_ISSUED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: DEPENDENT_COHORT_MIGRATION_KEY,
    allowedValues: ["none", "cohort-a-migrated", "cohort-a-and-b-migrated"],
    initialValue: "none",
  },
  {
    key: MISUSE_MONITORING_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: AUDIT_LOG_REVIEW_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
