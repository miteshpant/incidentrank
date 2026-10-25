import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Live-traffic health (what the candidate is protecting) ──────────
  // Percent of live customer writes/reads through the Application API
  // that currently succeed. Stays high through most states — contention
  // shows up first as LATENCY (liveWriteP99Ms), not outright failure,
  // unless the candidate has engaged a short statement timeout, in which
  // case contention becomes visible, explicit write failures instead.
  requestSuccessRate: 99.8,
  // p99 latency, in ms, for a live customer write through the
  // Application API to the Primary Database. This is the metric that
  // silently balloons under lock contention while requestSuccessRate
  // still looks tolerable (dbStatementTimeoutMode="long" lets writes
  // queue instead of failing).
  liveWriteP99Ms: 80,

  // ── Primary Database contention (the REQUIRED pressure-transfer
  // target) ──────────────────────────────────────────────────────────
  // Average milliseconds a live write currently waits behind
  // backfill-held row/table locks before it can proceed. Zero is
  // healthy. This is the primary, most direct signal of the backfill
  // concurrency -> DB locks pressure-transfer mechanism.
  dbLockWaitMs: 0,
  // Count of live writes that failed outright this tick because they
  // exceeded dbStatementTimeoutMode's configured wait bound. Zero is
  // healthy. Only nonzero when dbStatementTimeoutMode="short" is
  // actively converting queued contention into explicit failures.
  liveWriteTimeoutFailureCount: 0,
  // Severity field summarizing Primary Database health under
  // contention.
  primaryDatabaseStatus: "normal",
  // Percent of the Primary Database's live-traffic connection pool
  // currently in use by Production Clients' own writes (separate from
  // whatever the backfill is consuming). Climbs when the backfill is
  // NOT yielding budget to live traffic.
  liveConnectionPoolUtilizationPct: 20,

  // ── Backfill progress / backlog (recoverable, must be bounded, not
  // frozen or silently emptied) ────────────────────────────────────────
  // Historical rows still waiting to be genuinely backfilled. Starts at
  // a large authored total; only ever decreases when backfill workers
  // are actually running and actually processing rows (never by
  // skipMarkComplete alone contributing real progress — see
  // skippedRowCount below for that distinction).
  backfillQueueDepth: 48_000,
  // Historical rows the backfill has genuinely, correctly rewritten so
  // far (the honest progress counter).
  backfillRowsCompletedCount: 0,
  // Severity field summarizing backfill job health/progress.
  backfillStatus: "normal",

  // ── Historical / cumulative damage (phase6d.4.md section 13's
  // doctrine) ───────────────────────────────────────────────────────
  // Historical rows marked "complete" by skipMarkComplete WITHOUT the
  // backfill worker having actually rewritten them. This can only ever
  // increase — no control, mode, or elapsed time reduces it. Marking a
  // row complete to make the queue-depth/deadline countdown look better
  // is a real, permanent correctness loss (the business invariant
  // "historical rows must not be skipped or silently marked complete"),
  // not a recoverable backlog state. See rules.ts / action-classifications.
  skippedRowCount: 0,

  // ── Deadline pressure (state, not a control) ─────────────────────────
  // Days remaining until the authored migration deadline. Decreases
  // only with elapsed simulated time (see timed-events.ts), never with
  // any control — modeling that the deadline is a real external
  // constraint the candidate cannot negotiate away, only work within.
  migrationDeadlineDaysRemaining: 10,

  // ── Generic string-state summary, read by scoring's
  // finalStringEquals/NotEquals measures and by success/acceptable
  // conditions ─────────────────────────────────────────────────────────
  //   "contending"       — backfill actively degrading live traffic.
  //   "protected"        — live traffic safe, backfill slowed/paused,
  //                         queue bounded and not silently emptied.
  //   "safely-resumed"    — live traffic safe AND backfill resumed at a
  //                         real, bounded, safe rate, queue draining.
  //   "complete-honest"   — backfill fully, honestly complete; queue at
  //                         zero with zero skipped rows.
  //   "integrity-violated" — rows were skip-marked-complete; never
  //                          improves regardless of later behavior.
  productionDatabaseStatus: "protected",
};
