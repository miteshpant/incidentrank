import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How many parallel backfill worker threads are actively scanning and
 * rewriting historical rows against the Primary Database. "low" (2
 * workers) is the pre-incident/safe-minimum level. "medium" (8) and
 * "high" (24) drain the historical backlog faster, but EVERY additional
 * worker holds row/table locks against the same Primary Database live
 * traffic is writing to — this is the scenario's REQUIRED pressure-
 * transfer mechanism (phase6d.4.md section 14): raising concurrency
 * without also reshaping chunk size / scheduling window / DB priority
 * measurably worsens dbLockWaitMs and liveWriteP99Ms. See rules.ts's
 * "high-concurrency-unmanaged-contention" trap.
 */
export const BACKFILL_CONCURRENCY_KEY = "backfillConcurrency";

/**
 * How many historical rows each backfill worker rewrites per database
 * transaction. "large" (5,000 rows/txn, pre-incident default) holds a
 * single transaction's locks for a long wall-clock duration — efficient
 * throughput per worker, but each transaction blocks live writers for
 * far longer once it is actually holding contested locks. "small" (200
 * rows/txn) trades backfill throughput for materially shorter
 * individual lock-hold windows, which is one of the two required levers
 * (together with dbPriorityMode) that make raising concurrency safe
 * rather than harmful.
 */
export const BACKFILL_CHUNK_SIZE_KEY = "backfillChunkSize";

/**
 * When the backfill is allowed to actively run. "anytime" (pre-incident
 * default) lets it compete with live traffic at any hour, including
 * this incident's live-traffic peak. "off-peak-only" restricts active
 * backfill work to the simulated low-traffic window — it does not
 * change how contentious an in-progress chunk is, but it removes the
 * backfill from the database entirely during the highest-risk live-
 * traffic period, which is a real, distinct, legitimate way to protect
 * production without permanently killing the backfill.
 */
export const BACKFILL_SCHEDULING_WINDOW_KEY = "backfillSchedulingWindow";

/**
 * Which side of the Primary Database's connection/lock budget gets
 * preference when both live traffic and the backfill are contending for
 * it. "balanced" (pre-incident default) gives both equal footing, which
 * is fine at low backfill concurrency but is NOT what protects live
 * writes once concurrency is raised. "live-traffic-first" reserves a
 * real, authored floor of connection/lock capacity for Production
 * Clients' writes and makes the backfill yield under contention — the
 * second of the two required levers (together with chunk size) that
 * make raising concurrency safe.
 */
export const DB_PRIORITY_MODE_KEY = "dbPriorityMode";

/**
 * Whether the backfill is actively running at all. "running"
 * (pre-incident default) means it is actively consuming whatever
 * concurrency/chunk-size/scheduling-window/priority budget is currently
 * configured. "paused" stops it from issuing any new backfill
 * transactions whatsoever — the single most reliable way to remove ALL
 * backfill-side pressure from the Primary Database immediately, at the
 * real cost that the historical backlog does not shrink while paused
 * and the migration deadline keeps approaching. This is NOT equivalent
 * to permanently abandoning the backfill — see backfillQueueDepth, which
 * never resets just because the backfill is paused.
 */
export const BACKFILL_PAUSE_RESUME_KEY = "backfillPauseResume";

/**
 * How long a live (Production Clients -> Application API) database
 * statement is allowed to wait before being aborted. "long" (pre-
 * incident default, 30s) lets live writes queue behind backfill-held
 * locks for a long time rather than failing outright — this keeps
 * requestSuccessRate looking deceptively tolerable while liveWriteP99Ms
 * silently balloons underneath it. "short" (2s) fails a live write
 * outright rather than letting it queue indefinitely behind backfill
 * contention — this trades a higher rate of fast, explicit live-write
 * failures for bounding how long any single live write can be blocked,
 * surfacing contention as visible errors instead of hidden latency.
 */
export const DB_STATEMENT_TIMEOUT_MODE_KEY = "dbStatementTimeoutMode";

/**
 * How many backfill chunks the Backfill Queue/Coordinator is allowed to
 * hand to workers per minute, independent of how many workers
 * (backfillConcurrency) exist. "unthrottled" (pre-incident default) lets
 * the coordinator dispatch as fast as workers can accept chunks — at
 * high concurrency this is what actually saturates the Primary
 * Database's incoming transaction rate. "throttled" caps dispatch rate
 * to a real, authored ceiling regardless of how many workers are
 * configured, which is a genuinely distinct lever from worker count
 * itself (lowering concurrency reduces how many chunks can run in
 * parallel; throttling dispatch rate caps how fast NEW chunks start
 * regardless of parallelism) — see rules.ts's dispatch-throttle rules
 * for the case where this is the one lever that keeps high concurrency
 * safe without also demanding the full priority+chunk-size combination.
 */
export const QUEUE_DISPATCH_RATE_KEY = "queueDispatchRate";

/**
 * The scenario's forbidden lever (phase6d.4.md's historical-damage
 * doctrine / business invariant "historical rows must not be skipped or
 * silently marked complete"). "off" (pre-incident default) never marks
 * a historical row complete without the backfill worker having actually
 * rewritten it. "on" lets the coordinator mark any row it cannot
 * process within its current attempt budget as complete anyway, purely
 * to make backfillQueueDepth and the migration-deadline countdown look
 * better — this DOES make the queue depth number read better almost
 * immediately, but every row marked complete this way increments
 * skippedRowCount, a real, authored, NEVER-self-resetting counter (see
 * metrics.ts/rules.ts). Classified UNSAFE unconditionally once used,
 * regardless of how healthy every other metric looks afterward — see
 * rules.ts's skip-mark-complete trap and action-classifications.ts.
 */
export const SKIP_MARK_COMPLETE_KEY = "skipMarkComplete";

export const controls: ControlDefinition[] = [
  {
    key: BACKFILL_CONCURRENCY_KEY,
    allowedValues: ["low", "medium", "high"],
    initialValue: "low",
  },
  {
    key: BACKFILL_CHUNK_SIZE_KEY,
    allowedValues: ["large", "small"],
    initialValue: "large",
  },
  {
    key: BACKFILL_SCHEDULING_WINDOW_KEY,
    allowedValues: ["anytime", "off-peak-only"],
    initialValue: "anytime",
  },
  {
    key: DB_PRIORITY_MODE_KEY,
    allowedValues: ["balanced", "live-traffic-first"],
    initialValue: "balanced",
  },
  {
    key: BACKFILL_PAUSE_RESUME_KEY,
    allowedValues: ["running", "paused"],
    initialValue: "running",
  },
  {
    key: DB_STATEMENT_TIMEOUT_MODE_KEY,
    allowedValues: ["long", "short"],
    initialValue: "long",
  },
  {
    key: QUEUE_DISPATCH_RATE_KEY,
    allowedValues: ["unthrottled", "throttled"],
    initialValue: "unthrottled",
  },
  {
    key: SKIP_MARK_COMPLETE_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
