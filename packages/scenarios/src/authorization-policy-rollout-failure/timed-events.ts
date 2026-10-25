import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the v2-bad policy rollout has already reached enough
// of the fleet to produce visible selective false-denies.
export const REGRESSION_ONSET_MS = 20_000;

// If left unaddressed this long, the rollout has continued expanding
// exposure (rolloutFreeze was never engaged) and false-denies have
// spread to a materially larger share of traffic.
export const SUSTAINED_ROLLOUT_MS = REGRESSION_ONSET_MS + 3 * 60_000;

// Cache-convergence windows (recovery-lag binding, phase6d3.md section
// 14): once the candidate has BOTH fixed the source (pin/rollback to
// v1) AND engaged active invalidation, cacheConvergencePercent does not
// jump to 100 on the same tick — it climbs across these three real
// elapsed-time windows. Anchored after SUSTAINED_ROLLOUT_MS so they are
// reachable even in the worst-case timeline where the candidate let the
// rollout run its full course before intervening.
export const CONVERGENCE_WINDOW_1_MS = SUSTAINED_ROLLOUT_MS + 60_000;
export const CONVERGENCE_WINDOW_2_MS = SUSTAINED_ROLLOUT_MS + 3 * 60_000;
export const CONVERGENCE_FULLY_DONE_MS = SUSTAINED_ROLLOUT_MS + 6 * 60_000;

// Slower passive-TTL-only convergence windows (no active invalidation
// engaged, long TTL): convergence still eventually happens on its own
// cache-expiry schedule, but far more slowly — proving
// cacheInvalidation is a real, non-dead accelerant rather than the only
// path to convergence at all.
export const PASSIVE_CONVERGENCE_WINDOW_1_MS = SUSTAINED_ROLLOUT_MS + 4 * 60_000;
export const PASSIVE_CONVERGENCE_FULLY_DONE_MS = SUSTAINED_ROLLOUT_MS + 14 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "regression-onset",
    atMs: REGRESSION_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "The v2 policy rollout has reached enough of the fleet to produce selective false-denies on a subset of resource/identity combinations. No unauthorized access has occurred.",
    setTriggers: { rolloutRegressionActive: true },
  },
  {
    id: "sustained-rollout",
    atMs: SUSTAINED_ROLLOUT_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The rollout has continued expanding exposure without being frozen — false-denies now affect a materially larger share of traffic, and fleet version skew has widened.",
    setTriggers: { rolloutRegressionActive: true, sustainedRollout: true },
  },
  {
    id: "convergence-window-1-elapsed",
    atMs: CONVERGENCE_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first active cache-convergence window has elapsed.",
    setTriggers: { convergenceWindow1Elapsed: true },
  },
  {
    id: "convergence-window-2-elapsed",
    atMs: CONVERGENCE_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second active cache-convergence window has elapsed.",
    setTriggers: { convergenceWindow1Elapsed: true, convergenceWindow2Elapsed: true },
  },
  // NOTE: timedEvents must be kept in strictly ascending atMs order —
  // tickOnce (packages/simulator/src/tick.ts) advances
  // nextTimedEventIndex monotonically forward through this array by
  // POSITION, not by re-sorting on atMs, so an out-of-order entry here
  // would be processed at the wrong simulated moment (or skipped
  // relative to a later-indexed-but-earlier-atMs entry). This passive-
  // convergence window (440_000ms) falls BETWEEN convergence-window-2
  // (380_000ms) and convergence-fully-done (560_000ms), so it is
  // listed between them, not after both.
  {
    id: "passive-convergence-window-1-elapsed",
    atMs: PASSIVE_CONVERGENCE_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first passive TTL-cycle convergence window has elapsed.",
    setTriggers: { passiveConvergenceWindow1Elapsed: true },
  },
  {
    id: "convergence-fully-done",
    atMs: CONVERGENCE_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough active cache-convergence time has elapsed for a fully-engaged invalidation sweep to have reached the entire fleet.",
    setTriggers: {
      convergenceWindow1Elapsed: true,
      convergenceWindow2Elapsed: true,
      convergenceFullyDone: true,
    },
  },
  {
    id: "passive-convergence-fully-done",
    atMs: PASSIVE_CONVERGENCE_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough passive TTL-cycle time has elapsed for the entire fleet to have naturally refreshed, with no active invalidation sweep ever engaged.",
    setTriggers: {
      passiveConvergenceWindow1Elapsed: true,
      passiveConvergenceFullyDone: true,
    },
  },
];
