import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: a large historical backfill, already running at
// "low" concurrency, is scheduled to ramp toward a migration deadline
// right as live customer traffic enters its daily peak. The backfill
// itself did not change yet at this instant — onset models the
// traffic-side pressure arriving, not a candidate action.
export const CONTENTION_ONSET_MS = 20_000;

// If unmanaged contention is left running this long, lock wait and
// backlog growth have compounded into a materially worse, more
// dangerous state — modeling that unmanaged contention gets worse the
// longer it runs, not a fixed one-time blip.
export const SUSTAINED_CONTENTION_MS = CONTENTION_ONSET_MS + 3 * 60_000;

// Skip-mark-complete exposure window: if the forbidden skipMarkComplete
// lever has been left on this long while a real queue backlog exists, a
// bounded number of additional historical rows have genuinely been
// skip-marked (skippedRowCount ratchets forward here) — mirroring Data
// Pipeline Freshness Collapse's dropExposureWindow pattern. Anchored
// well before SUSTAINED_CONTENTION_MS and gated on sustainedContention
// being false, so it only ever matters strictly before sustained
// contention fires, never overlapping the later safe-resume timeline.
export const SKIP_EXPOSURE_WINDOW_MS = CONTENTION_ONSET_MS + 45_000;

// Recovery-lag windows (phase6d.4.md section 15, binding): once the
// candidate has genuinely contained DB pressure (paused or safely
// reshaped the backfill, protected live traffic), dbLockWaitMs and
// liveWriteP99Ms do not snap back to healthy on the next tick — they
// drain across these successive, real-elapsed-time windows. Anchored
// AFTER SUSTAINED_CONTENTION_MS so they are reachable even when the
// candidate let contention compound first.
export const RECOVERY_WINDOW_1_MS = SUSTAINED_CONTENTION_MS + 90_000;
export const RECOVERY_WINDOW_2_MS = SUSTAINED_CONTENTION_MS + 3 * 60_000;
export const RECOVERY_WINDOW_FULLY_STABLE_MS = SUSTAINED_CONTENTION_MS + 6 * 60_000;

// Safe-resume drain windows: once the candidate has stabilized
// production AND resumed the backfill at a bounded, DB-priority-
// protected rate, backfillQueueDepth drains over real elapsed time
// toward genuine, honest completion — never instantly, and never by
// skip-marking. These windows are only anchored AFTER
// RECOVERY_WINDOW_FULLY_STABLE_MS: a candidate cannot safely resume
// meaningful backfill throughput before production itself is stable.
export const RESUME_DRAIN_WINDOW_1_MS = RECOVERY_WINDOW_FULLY_STABLE_MS + 4 * 60_000;
export const RESUME_DRAIN_WINDOW_2_MS = RECOVERY_WINDOW_FULLY_STABLE_MS + 9 * 60_000;
export const RESUME_DRAIN_FULLY_COMPLETE_MS = RECOVERY_WINDOW_FULLY_STABLE_MS + 15 * 60_000;

// The authored migration deadline, in elapsed simulated time. Business
// invariant: the deadline matters, but never outranks production
// correctness. This fires regardless of candidate behavior — it is an
// external constraint, narrated distinctly from any candidate action or
// recovery.
export const MIGRATION_DEADLINE_MS = RECOVERY_WINDOW_FULLY_STABLE_MS + 20 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never sorts
// by atMs. Every entry below is already in strictly ascending atMs
// order.
export const timedEvents: TimedEvent[] = [
  {
    id: "contention-onset",
    atMs: CONTENTION_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "Live customer traffic has entered its daily peak while the historical backfill continues running — Primary Database contention has begun.",
    setTriggers: { contentionActive: true },
  },
  {
    id: "skip-exposure-window-elapsed",
    atMs: SKIP_EXPOSURE_WINDOW_MS,
    type: "TRIGGER_SET",
    message: "A skip-mark-complete exposure window has elapsed.",
    setTriggers: { skipExposureWindowElapsed: true },
  },
  {
    id: "sustained-contention",
    atMs: SUSTAINED_CONTENTION_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "Database contention has persisted long enough that lock wait and backlog growth have compounded into a materially larger, more dangerous state.",
    setTriggers: { contentionActive: true, sustainedContention: true },
  },
  // NOTE: recovery/drain-window triggers below fire unconditionally on
  // wall-clock atMs, exactly like every other timed event in this
  // engine. rules.ts is what makes them MEANINGFUL only once the
  // candidate has actually engaged a safe configuration.
  {
    id: "recovery-window-1-elapsed",
    atMs: RECOVERY_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first production-recovery window has elapsed.",
    setTriggers: { recoveryWindow1Elapsed: true },
  },
  {
    id: "recovery-window-2-elapsed",
    atMs: RECOVERY_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second production-recovery window has elapsed.",
    setTriggers: { recoveryWindow1Elapsed: true, recoveryWindow2Elapsed: true },
  },
  {
    id: "recovery-window-fully-stable-elapsed",
    atMs: RECOVERY_WINDOW_FULLY_STABLE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough recovery time has elapsed for a fully-protected configuration to have returned Primary Database contention to its pre-incident baseline.",
    setTriggers: {
      recoveryWindow1Elapsed: true,
      recoveryWindow2Elapsed: true,
      recoveryWindowFullyStableElapsed: true,
    },
  },
  {
    id: "resume-drain-window-1-elapsed",
    atMs: RESUME_DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first safe-resume backfill-drain window has elapsed.",
    setTriggers: { resumeDrainWindow1Elapsed: true },
  },
  {
    id: "resume-drain-window-2-elapsed",
    atMs: RESUME_DRAIN_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second safe-resume backfill-drain window has elapsed.",
    setTriggers: { resumeDrainWindow1Elapsed: true, resumeDrainWindow2Elapsed: true },
  },
  {
    id: "resume-drain-fully-complete-elapsed",
    atMs: RESUME_DRAIN_FULLY_COMPLETE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough safe-resume drain time has elapsed for a fully-engaged, bounded-rate backfill to have honestly completed the remaining historical backlog.",
    setTriggers: {
      resumeDrainWindow1Elapsed: true,
      resumeDrainWindow2Elapsed: true,
      resumeDrainFullyCompleteElapsed: true,
    },
  },
  {
    id: "migration-deadline-reached",
    atMs: MIGRATION_DEADLINE_MS,
    type: "TRIGGER_SET",
    message:
      "The migration deadline has been reached on the external calendar. This is a scheduling fact, not a production-health event — it never changes database contention or backfill progress by itself.",
    setTriggers: { migrationDeadlineReached: true },
  },
];
