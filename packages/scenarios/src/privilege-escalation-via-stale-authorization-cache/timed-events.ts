import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: a privilege has just been revoked at the Policy
// Store (the source of truth). The Cache Distribution fleet has not
// yet had a chance to converge — a subset of cache instances still
// believe the privilege is valid.
export const REVOCATION_ONSET_MS = 20_000;

// If left unaddressed this long, no invalidation push has reached the
// fleet and no purge has been requested — the unconverged window has
// simply persisted at the same (bounded, but not shrinking) size.
export const SUSTAINED_UNCONVERGED_MS = REVOCATION_ONSET_MS + 3 * 60_000;

// Active-convergence windows (recovery-lag binding): once the
// candidate has engaged a real propagation lever (immediate/forced
// invalidation, or a targeted purge), cacheConvergencePercent does not
// jump to 100 on the same tick — it climbs across these real elapsed
// windows. Anchored after SUSTAINED_UNCONVERGED_MS so they are
// reachable even in the worst-case timeline where the candidate let
// the unconverged window run its full course before intervening.
export const CONVERGENCE_WINDOW_1_MS = SUSTAINED_UNCONVERGED_MS + 45_000;
export const CONVERGENCE_WINDOW_2_MS = SUSTAINED_UNCONVERGED_MS + 2 * 60_000;
export const CONVERGENCE_FULLY_DONE_MS = SUSTAINED_UNCONVERGED_MS + 4 * 60_000;

// Slower passive-TTL-only convergence windows (invalidation left
// "lazy", no purge requested): convergence still eventually happens on
// each instance's own TTL expiry schedule, but far more slowly —
// proving cacheInvalidationMode/cachePurgeScope are real, non-dead
// accelerants rather than the only path to convergence at all.
export const PASSIVE_CONVERGENCE_WINDOW_1_MS = SUSTAINED_UNCONVERGED_MS + 5 * 60_000;
export const PASSIVE_CONVERGENCE_FULLY_DONE_MS = SUSTAINED_UNCONVERGED_MS + 11 * 60_000;

// SEQUENCING TRAP WINDOW: enough elapsed time has passed that it would
// be tempting to simply ASSUME the fleet has converged by now — but
// assumption is not verification. This window deliberately sits
// BEFORE CONVERGENCE_FULLY_DONE_MS, at a point where a real (if
// shrinking) minority of the fleet genuinely has not converged yet
// even though "a while" has passed. A candidate who broadly re-trusts
// the cache layer here, without convergenceVerification engaged, is
// trusting a fleet that is not actually fully converged.
export const PLAUSIBLE_BUT_UNVERIFIED_MS = CONVERGENCE_WINDOW_2_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "revocation-onset",
    atMs: REVOCATION_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "A privilege has been revoked at the Policy Store. The Cache Distribution fleet has not yet converged — a subset of cache instances may still grant the revoked privilege if consulted and trusted.",
    setTriggers: { privilegeRevoked: true },
  },
  {
    id: "sustained-unconverged",
    atMs: SUSTAINED_UNCONVERGED_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "No invalidation push or purge has reached the fleet yet — the unconverged window has persisted without shrinking.",
    setTriggers: { privilegeRevoked: true, sustainedUnconverged: true },
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
    message:
      "A second active cache-convergence window has elapsed. Enough time has passed that it may feel safe to assume the fleet has converged — this has not yet been verified.",
    setTriggers: { convergenceWindow1Elapsed: true, convergenceWindow2Elapsed: true },
  },
  // NOTE: timedEvents must be kept in strictly ascending atMs order —
  // tickOnce advances nextTimedEventIndex monotonically forward through
  // this array by POSITION, not by re-sorting on atMs. With these
  // offsets, CONVERGENCE_FULLY_DONE_MS (440_000) < PASSIVE_CONVERGENCE_
  // WINDOW_1_MS (500_000) < PASSIVE_CONVERGENCE_FULLY_DONE_MS (860_000),
  // so convergence-fully-done is correctly listed before both passive
  // events below.
  {
    id: "convergence-fully-done",
    atMs: CONVERGENCE_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough active cache-convergence time has elapsed for a fully-engaged invalidation/purge to have reached the entire fleet.",
    setTriggers: {
      convergenceWindow1Elapsed: true,
      convergenceWindow2Elapsed: true,
      convergenceFullyDone: true,
    },
  },
  {
    id: "passive-convergence-window-1-elapsed",
    atMs: PASSIVE_CONVERGENCE_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first passive TTL-cycle convergence window has elapsed.",
    setTriggers: { passiveConvergenceWindow1Elapsed: true },
  },
  {
    id: "passive-convergence-fully-done",
    atMs: PASSIVE_CONVERGENCE_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough passive TTL-cycle time has elapsed for the entire fleet to have naturally refreshed, with no active invalidation or purge ever engaged.",
    setTriggers: {
      passiveConvergenceWindow1Elapsed: true,
      passiveConvergenceFullyDone: true,
    },
  },
];
