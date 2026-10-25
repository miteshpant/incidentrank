import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Ad-hoc query load (the contention source) ───────────────────────
  // Concurrent ad-hoc (BI Users + Data Science combined) queries
  // currently admitted to the Warehouse.
  adHocConcurrentQueries: 8,
  // Concurrent ad-hoc queries currently queued/waiting for an admission
  // slot, rather than denied outright. 0 whenever ad-hoc demand fits
  // within whatever is currently admitted.
  adHocQueuedQueries: 0,

  // ── Scheduled Reports — the SLA-bound critical jobs ─────────────────
  // Minutes remaining until the current critical scheduled-report job's
  // hard business deadline (e.g. month-end close, SLA-bound external
  // reporting). Fixed business context, not a lever.
  reportDeadlineMinutesRemaining: 40,
  // How many minutes the currently-running critical report job has
  // actually been queued/waiting for a Warehouse admission slot it has
  // not yet received.
  reportQueueWaitMinutes: 0,
  // Whether the critical scheduled-report job currently in flight is on
  // track to complete within its deadline, given current queue wait and
  // warehouse throughput — 1 for on-track, 0 for not, modeled as a
  // number since engine StateValue has no boolean variant. This is the
  // metric the candidate is actually accountable for.
  reportOnTrackForSla: 1,

  // ── Data Science — long-running jobs and their real lost-work cost ──
  // Minutes of accumulated compute a currently-running Data Science job
  // has invested that would be lost if it were killed right now without
  // a checkpoint.
  dataScienceJobUncheckpointedMinutes: 0,
  // HISTORICAL/cumulative hours of Data Science work actually lost this
  // incident to an abrupt kill (hard-kill) or a smaller, bounded
  // checkpoint-tail loss (graceful-stop). This can only ever increase
  // while a kill is active — there is no control, mode, or elapsed time
  // that reduces it once work has actually been destroyed. See
  // definition.ts's numericWatchFields (trackPeak: true) and the
  // "historical damage survives" regression test.
  dataScienceLostWorkHoursCumulative: 0,

  // ── Warehouse (the shared, finite resource) ──────────────────────────
  // Percent of total Warehouse query-execution capacity currently
  // utilized across every admitted query, any class.
  warehouseUtilizationPercent: 55,
  // P95 query latency across ALL admitted queries, any class, in
  // seconds. Rises under contention regardless of which class is
  // waiting.
  queryLatencyP95Seconds: 12,

  // ── BI/Data Science access (the overcorrection trap's own signal) ───
  // Percent of ad-hoc (BI + Data Science) query attempts currently being
  // served at all (admitted immediately, queued, or throttled) versus
  // flatly refused. 100 means ad-hoc access exists in SOME form, however
  // slow; anything below 100 means some ad-hoc traffic is being refused
  // outright.
  adHocAccessAvailabilityPercent: 100,

  // ── Summary string-state fields (read by scoring + success/acceptable
  // conditions as the single authoritative summaries) ─────────────────
  //   "on-track"     — the current critical scheduled-report job is on
  //                     track to complete within its SLA deadline.
  //   "at-risk"      — queue wait has grown enough that the deadline is
  //                     genuinely at risk of being missed.
  //   "breached"     — the critical scheduled-report job's SLA deadline
  //                     has actually been missed.
  slaStatus: "on-track",
  //   "balanced"          — ad-hoc access is open (queued/throttled at
  //                          most, never refused) AND the SLA is
  //                          protected — the genuine, intended tradeoff.
  //   "overcorrected"     — ad-hoc access has been revoked outright to
  //                          protect the SLA — a real business-invariant
  //                          violation regardless of how good the SLA
  //                          number looks.
  //   "sla-exposed"       — ad-hoc access remains fully open, but the SLA
  //                          is genuinely at risk or breached because
  //                          nothing is prioritizing the critical job.
  workloadTradeoffStatus: "balanced",
  //   "normal"   — no SLA risk currently active.
  //   "warning"  — SLA genuinely at risk (queue wait eating into the
  //                deadline buffer) but not yet breached.
  //   "critical" — SLA has been breached, or ad-hoc access has been
  //                revoked outright (an invariant violation is always
  //                "critical" severity regardless of SLA outcome).
  slaRiskSeverity: "normal",

  //   "not-applicable" — no contention is currently active, so there is
  //                       nothing to communicate yet.
  //   "proactive"       — reportDeadlineCommunication="proactive-notice"
  //                       while contention is active: BI/Data Science
  //                       stakeholders are explicitly told which window
  //                       is being bounded/throttled and why, rather
  //                       than silently experiencing slower queries.
  //   "silent"          — reportDeadlineCommunication="silent" (the
  //                       default) while contention is active: whatever
  //                       admission/cap policy is in effect is applied
  //                       with no communication at all. Never changes
  //                       warehouse mechanics or the SLA outcome by
  //                       itself, but is a real, measured operational-
  //                       maturity gap this scenario scores on
  //                       operationalEfficiency.
  stakeholderCommunicationStatus: "not-applicable",

  //   "not-applicable" — no contention is currently active.
  //   "draining"        — a safe strategy is genuinely engaged (the SLA
  //                       is protected) but the pre-existing ad-hoc
  //                       backlog has not yet fully cleared — this is
  //                       what distinguishes ACCEPTABLE from OPTIMAL:
  //                       successCondition requires "clear" specifically
  //                       so a still-draining state can satisfy
  //                       acceptableCondition without also satisfying
  //                       successCondition.
  //   "clear"           — the backlog has fully drained; nothing is
  //                       currently queued beyond ordinary baseline
  //                       levels.
  backlogStatus: "not-applicable",
};
