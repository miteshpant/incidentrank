import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Front-door acceptance (the DECOY signal) ────────────────────────
  // Deletion requests are accepted successfully the ENTIRE incident —
  // acceptance never fails here. A candidate who only watches this
  // number never discovers anything is wrong: the real risk is entirely
  // in whether ACCEPTED requests actually finish executing across every
  // required downstream store, not whether they were accepted at all.
  requestAcceptanceSuccessRate: 100,

  // ── Backlog / execution-completeness state (the REAL problem) ───────
  // Count of deletion requests that have been accepted but have not yet
  // genuinely completed end-to-end (across every required downstream
  // store). 0 is healthy. Grows whenever execution throughput falls
  // behind acceptance rate.
  deletionBacklogCount: 0,
  // Age in days of the single oldest still-incomplete request currently
  // in the backlog. 0 is healthy (no backlog). This is what makes a
  // "prioritize newest/easiest first" strategy visibly fail: the oldest
  // request's age keeps climbing even while overall backlog count or
  // completion percent might look tolerable.
  oldestRequestAgeDays: 0,
  // Percent of currently-in-scope deletion requests that have genuinely
  // completed end-to-end (every required downstream store has
  // independently confirmed deletion). 100 is healthy. This is
  // DELIBERATELY DISTINCT from completionMarkingPolicy's own book-
  // keeping: a request can be MARKED complete (see
  // falseCompletionCount) without this percent reflecting a real
  // completion underneath it.
  endToEndCompletionPercent: 100,
  // Per-downstream-store completion percentages — tracked independently
  // so no one store's completeness can hide behind another's number,
  // exactly the per-data-class discipline Data Retention Policy
  // Misconfiguration uses for its two independent compliance classes.
  productDbCompletionPercent: 100,
  analyticsStoreCompletionPercent: 100,
  backupIndexCompletionPercent: 100,
  // Count of requests currently within a dangerous window of breaching
  // their regulatory/policy deletion deadline (not yet breached, but at
  // real risk). Candidate-visible so a "which requests are at risk right
  // now" judgment is possible before a breach actually happens.
  deadlineRiskCount: 0,

  // ── REQUIRED historical consequence counters (both independently
  // tracked, both non-resetting/peak-tracked via numericWatchFields'
  // trackPeak:true, see definition.ts) ─────────────────────────────────
  // Cumulative count of deletion requests that have been marked
  // "complete" during this attempt while at least one required
  // downstream store had not actually finished deleting the record — a
  // real, PERMANENT audit-trail fact: once a request has been falsely
  // marked complete, that false record exists in the system's history
  // for the rest of the attempt, even after the policy is corrected and
  // no FURTHER requests are falsely completed. This is the scenario's
  // central, defining historical damage counter.
  falseCompletionCount: 0,
  // Cumulative count of deletion requests that have aged past their own
  // mandated regulatory/policy deletion deadline while still
  // genuinely incomplete, at any point during this attempt. Also
  // PERMANENT — once a request has breached its deadline, that breach
  // happened and stays on the record even once the backlog is later
  // drained and the request eventually completes.
  deadlineBreachedCount: 0,

  // ── Summary string-state fields (authoritative for scoring +
  // success/acceptable conditions) ────────────────────────────────────
  //   "healthy"              — no backlog, no false completion, no
  //                            deadline breach, every store tracked.
  //   "backlog-draining"     — a real backlog exists but is shrinking,
  //                            no false completion or deadline breach
  //                            currently live.
  //   "false-complete-active" — at least one request is CURRENTLY
  //                            marked complete while a required
  //                            downstream store has not actually
  //                            finished — the scenario's defining,
  //                            never-acceptable live violation.
  //   "deadline-breach-active" — at least one request is CURRENTLY past
  //                            its mandated deletion deadline, still
  //                            incomplete.
  //   "untracked-gap-active"  — Backup Index obligations are currently
  //                            not being tracked/reported at all for
  //                            in-flight requests (an invisible
  //                            auditability gap, independent of whether
  //                            anything is actually falsely complete).
  deletionWorkflowStatus: "healthy",

  // Whether the Backup Index's own completion status is currently being
  // tracked/reported for in-flight requests. "tracked" (healthy) /
  // "untracked" (an auditability gap — see
  // BACKUP_INDEX_PROCESSING_MODE_KEY's doc comment).
  backupIndexTrackingStatus: "tracked",

  // ── Historical / cumulative damage severity summary (derived, read
  // by scoring + severity bookkeeping) ─────────────────────────────────
  // normal/warning/critical vocabulary only, per SeverityFieldConfig —
  // drives reliability's criticalTimeRatio measure: time spent with a
  // false-completion or deadline-breach violation genuinely live, never
  // time spent merely draining a real-but-honestly-tracked backlog.
  deletionIntegritySeverity: "normal",
};
