import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Live-traffic health (the DECOY signal) ──────────────────────────
  // Application and Event Store stay fully healthy the ENTIRE incident,
  // by design — the root cause is a retention/deletion POLICY
  // misconfiguration, never an availability failure. A candidate who
  // only watches these two numbers never discovers anything is wrong.
  // Per phase-6e-strategy-spec.md: "Availability is largely irrelevant"
  // for this scenario — this is the mechanism that makes that literal.
  applicationUptimePercent: 99.98,
  eventStoreWriteSuccessRate: 100,

  // ── Financial Records (Data Class 1: 7-year regulatory retention,
  // legal-hold-eligible) — the REAL, primary problem ──────────────────
  // Cumulative count of Financial Records records wrongly purged from
  // the Archive by the misconfigured policy during this attempt. Zero
  // is healthy. This can only ever increase while the misconfigured
  // policy (or an unenforced legal hold) is actively purging — there is
  // no control, mode, or elapsed time that reduces it once a record is
  // gone. A wrongly-deleted financial record is a real, PERMANENT,
  // irreversible compliance loss, not a recoverable backlog state. See
  // rules.ts / definition.ts's numericWatchFields (trackPeak: true).
  financialRecordsWronglyDeletedCount: 0,
  // Percent of currently-in-scope Financial Records that are correctly
  // retained per the mandated 7-year/legal-hold policy. 100 is healthy.
  // Drops while the misconfigured policy or an unenforced legal hold is
  // actively purging records that should be retained.
  financialRecordsComplianceRatePercent: 100,
  // Summary string-state field for Financial Records compliance,
  // authoritative for scoring + success/acceptable conditions.
  //   "compliant"        — no in-scope Financial Record is currently
  //                         being wrongly purged, by any path.
  //   "actively-violated" — Financial Records are currently being
  //                         wrongly purged RIGHT NOW (live violation).
  financialRecordsRetentionStatus: "compliant",
  // Fleet-wide re-validation tier for Financial Records, derived
  // directly from financialRecordsComplianceRatePercent and read by
  // scoring's dataIntegrity dimension via finalStringEquals — this is
  // what actually separates ACCEPTABLE (compliance rate not yet fully
  // re-validated, e.g. 88-92%) from OPTIMAL (100%) on the one dimension
  // that carries this scenario's real judgment, since both tiers
  // otherwise share the identical "compliant"/"compliant" retention
  // status pair. "full" (=100%) / "partial" (<100%, no live violation)
  // / "violated" (a live violation is currently happening — the same
  // condition as financialRecordsRetentionStatus="actively-violated").
  financialRecordsComplianceTier: "full",

  // ── User-Deletion-Request data (Data Class 2: mandated erasure
  // deadline — the SECONDARY, independent trap axis) ──────────────────
  // Cumulative count of user-deletion-request records that are
  // currently past their mandated erasure deadline because deletion
  // processing for this class was suspended (directly, or as a side
  // effect of a fleet-wide emergency halt) while requests kept arriving
  // on schedule. Zero is healthy. Like the financial-records count
  // above, this is a real, permanent, non-resetting exposure count —
  // every tick a genuinely-overdue erasure request sits unprocessed is
  // a real compliance violation against a different data class's own
  // mandated deadline, independent of the Financial Records problem.
  userDeletionRequestOverdueCount: 0,
  // Percent of pending user-deletion-request erasure jobs currently
  // within their mandated deadline. 100 is healthy.
  userDeletionRequestComplianceRatePercent: 100,
  //   "compliant"         — no user-deletion-request is currently past
  //                          its mandated erasure deadline.
  //   "deadline-breached" — at least one erasure request is currently
  //                          past its mandated deadline (live
  //                          violation, right now) — regardless of why
  //                          (direct suspension, or the fleet-wide
  //                          panic-halt trap).
  userDeletionRequestRetentionStatus: "compliant",

  // ── Ephemeral Logs (Data Class 3: no retention floor, no deletion
  // deadline — included purely to make the panic-halt trap's blast
  // radius concrete and visible) ──────────────────────────────────────
  // Gigabytes of ephemeral-log storage currently retained past its
  // normal (non-mandatory) purge schedule. Not a compliance violation
  // by itself — there is no legal floor or deadline on this class — but
  // a real, visible, avoidable storage-cost signal when a fleet-wide
  // halt is wider than it needed to be.
  ephemeralLogExcessStorageGb: 0,

  // ── Candidate-visible investigation/remediation state (state, not
  // controls) ──────────────────────────────────────────────────────────
  // Whether the affected-record audit (which specific Financial Records
  // were wrongly deleted, and when) has completed. Read together with
  // auditSequencing to determine whether the corrective policy change
  // was applied before or after the damage was actually characterized.
  //   "not-started" / "in-progress" / "completed" / "never-completed"
  // "never-completed" is a terminal value: once a fix has been applied
  // without ever having completed an audit first, this attempt can no
  // longer retroactively earn a completed audit.
  affectedRecordAuditStatus: "not-started",
  // Whether the corrected Financial Records policy, once authored, has
  // been validated against a held-out sample before touching production
  // again. "not-applicable" (no fix applied yet) / "validated" /
  // "unvalidated-direct-to-production".
  correctionValidationStatus: "not-applicable",

  // ── Historical / cumulative damage severity summary (derived,
  // read by scoring + severity bookkeeping) ───────────────────────────
  // Severity-field summary (normal/warning/critical vocabulary only,
  // per SeverityFieldConfig) of compliance risk specifically —
  // deliberately independent of Application/Event Store componentHealth
  // (which never leaves "healthy" in this scenario at all). This is
  // what drives reliability's criticalTimeRatio measure: time spent
  // with a COMPLIANCE violation genuinely live, never time spent with
  // availability degraded.
  complianceSeverity: "normal",
};
