import type { TimedEvent } from "@incidentrank/simulator";

// Peak event begins: traffic is legitimate and expected (a scheduled
// sale), not an anomaly. Edge/API pressure rises immediately.
export const PEAK_EVENT_ONSET_MS = 20_000;

// Left unaddressed, cache effectiveness has fallen far enough that
// cache-miss volume reaching the database has materially grown — the
// authored progression's second stage (cache effectiveness drops ->
// DB approaches saturation).
export const CACHE_DEGRADED_MS = PEAK_EVENT_ONSET_MS + 90_000;

// Left unaddressed further, DB pressure and async backlog have both
// grown enough to put the database at real risk of collapse — the
// progression's third/fourth stage.
export const SUSTAINED_PEAK_MS = PEAK_EVENT_ONSET_MS + 4 * 60_000;

// ── Recovery-lag window #1: Cache warmup (phase6d.4.md section 15) ──
// Once extended-ttl is engaged, cache hit rate does not jump back up
// on the same tick — it warms across these two real elapsed windows,
// modeled independently of DB connection pool recovery below.
export const CACHE_WARMUP_WINDOW_1_MS = SUSTAINED_PEAK_MS + 60_000;
export const CACHE_WARMUP_FULLY_DONE_MS = SUSTAINED_PEAK_MS + 3 * 60_000;

// ── Recovery-lag window #2: DB connection pool recovery ─────────────
// Once DB-side demand has genuinely been reduced (bounded budget +
// shed/disabled optional traffic + no premature worker-concurrency
// drain-trap), dbConnectionUtilizationPercent drains back down across
// these windows — modeled independently of cache warmup; a candidate
// who fixes the DB side but not the cache side (or vice versa) sees
// only ONE of the two recover, proving they are genuinely separate
// mechanisms, not a single combined "health" dial.
export const DB_RECOVERY_WINDOW_1_MS = SUSTAINED_PEAK_MS + 45_000;
export const DB_RECOVERY_FULLY_DONE_MS = SUSTAINED_PEAK_MS + 2 * 60_000 + 30_000;

// ── Async queue drain window ─────────────────────────────────────────
// Backlog drains over real elapsed time once workers are actively
// processing without being driven into a DB-pressure drain-trap.
export const QUEUE_DRAIN_WINDOW_1_MS = SUSTAINED_PEAK_MS + 60_000;
export const QUEUE_DRAIN_FULLY_DONE_MS = SUSTAINED_PEAK_MS + 3 * 60_000 + 30_000;

// If non-policy-based random shedding (loadShedding="random-shed") is
// left active this long, enough real checkout/transaction traffic has
// been indiscriminately dropped to cross the failure threshold — the
// historical-damage escalation window for that specific policy
// violation (distinct from the general sustainedPeak escalation above).
export const RANDOM_SHED_SUSTAINED_MS = PEAK_EVENT_ONSET_MS + 50_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "peak-event-onset",
    atMs: PEAK_EVENT_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "A scheduled peak sales event has begun. Inbound legitimate request volume at Edge/CDN has risen sharply. No action has been taken yet.",
    setTriggers: { peakEventActive: true },
  },
  {
    id: "random-shed-sustained",
    atMs: RANDOM_SHED_SUSTAINED_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "Elapsed time marker: this much time has now passed since the peak event began. This event has no effect by itself — it only matters for an attempt where load shedding was separately set to random-shed by the candidate, in which case enough real checkout/transaction traffic has, as a direct consequence of that earlier candidate action, now been indiscriminately dropped to approach a severe, irrecoverable threshold.",
    setTriggers: { peakEventActive: true, randomShedSustainedWindowElapsed: true },
  },
  {
    id: "cache-degraded",
    atMs: CACHE_DEGRADED_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "Elapsed time under unaddressed peak load has widened the product/catalog/search key-access pattern — cache hit rate has fallen further, and cache-miss volume reaching the database has grown as a direct consequence.",
    setTriggers: { peakEventActive: true, cacheDegraded: true },
  },
  {
    id: "sustained-peak",
    atMs: SUSTAINED_PEAK_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "Peak load has remained unaddressed long enough that database connection pressure and async backlog have both grown materially — the database is now approaching saturation risk.",
    setTriggers: { peakEventActive: true, cacheDegraded: true, sustainedPeak: true },
  },
  {
    id: "db-recovery-window-1-elapsed",
    atMs: DB_RECOVERY_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first database connection-pool recovery window has elapsed.",
    setTriggers: { dbRecoveryWindow1Elapsed: true },
  },
  {
    id: "queue-drain-window-1-elapsed",
    atMs: QUEUE_DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first async-queue drain window has elapsed.",
    setTriggers: { queueDrainWindow1Elapsed: true },
  },
  {
    id: "cache-warmup-window-1-elapsed",
    atMs: CACHE_WARMUP_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first cache warmup window has elapsed.",
    setTriggers: { cacheWarmupWindow1Elapsed: true },
  },
  {
    id: "db-recovery-fully-done",
    atMs: DB_RECOVERY_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed for the database connection pool to fully recover under genuinely reduced demand.",
    setTriggers: { dbRecoveryWindow1Elapsed: true, dbRecoveryFullyDone: true },
  },
  {
    id: "cache-warmup-fully-done",
    atMs: CACHE_WARMUP_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed for the cache to fully rewarm against the peak event's key-access pattern.",
    setTriggers: { cacheWarmupWindow1Elapsed: true, cacheWarmupFullyDone: true },
  },
  {
    id: "queue-drain-fully-done",
    atMs: QUEUE_DRAIN_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed for the async queue backlog to fully drain under genuinely sustainable worker throughput.",
    setTriggers: { queueDrainWindow1Elapsed: true, queueDrainFullyDone: true },
  },
];
