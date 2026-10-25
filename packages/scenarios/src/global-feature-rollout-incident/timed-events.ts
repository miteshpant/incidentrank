import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the global feature rollout has reached enough of EU
// traffic to produce the first observable region-dependent correctness
// divergence. No customer-visible unreadable reads have occurred yet.
export const REGRESSION_ONSET_MS = 20_000;

// If no region is halted/paused/rolled back by this point, the rollout
// has continued expanding exposure across all three regions and the
// already-incompatible write backlog has grown materially larger.
export const SUSTAINED_ROLLOUT_MS = REGRESSION_ONSET_MS + 3 * 60_000;

// If STILL left completely unaddressed for a long time beyond the first
// sustained-widening escalation, the backlog grows large enough to
// approach the scenario's catastrophic-failure threshold — proving a
// true zero-action attempt genuinely fails eventually rather than
// plateauing forever at a merely-bad-but-stable state.
export const CATASTROPHIC_WIDENING_MS = SUSTAINED_ROLLOUT_MS + 10 * 60_000;

// Repair progress windows (recovery-lag binding, phase6d.4.md section
// 15): once migrationRepair is set to "repairing", repairedRecordCount
// does not jump to the full backlog on the same tick — it climbs across
// these real elapsed-time windows.
export const REPAIR_WINDOW_1_MS = SUSTAINED_ROLLOUT_MS + 60_000;
export const REPAIR_WINDOW_2_MS = SUSTAINED_ROLLOUT_MS + 3 * 60_000;
export const REPAIR_FULLY_DONE_MS = SUSTAINED_ROLLOUT_MS + 6 * 60_000;

// NOTE: timedEvents must be kept in strictly ascending atMs order —
// tickOnce (packages/simulator/src/tick.ts) advances nextTimedEventIndex
// monotonically forward through this array by POSITION, not by
// re-sorting on atMs, so an out-of-order entry would stall every
// later-in-time-but-earlier-in-array event behind it (see
// authorization-policy-rollout-failure/timed-events.ts's identical
// note). CATASTROPHIC_WIDENING_MS (SUSTAINED_ROLLOUT_MS + 600_000 =
// 800_000ms) falls AFTER every repair window (up to REPAIR_FULLY_DONE_MS
// = SUSTAINED_ROLLOUT_MS + 360_000 = 560_000ms), so it is listed last.
export const timedEvents: TimedEvent[] = [
  {
    id: "regression-onset",
    atMs: REGRESSION_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "The global feature rollout has reached enough of EU traffic to produce the first region-dependent correctness divergence. No unreadable reads have occurred yet.",
    setTriggers: { rolloutRegressionActive: true },
  },
  {
    id: "sustained-rollout",
    atMs: SUSTAINED_ROLLOUT_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "No region was halted, paused, or rolled back — the rollout has continued expanding exposure across all three regions, and the already-incompatible write backlog has grown materially larger.",
    setTriggers: { rolloutRegressionActive: true, sustainedRollout: true },
  },
  {
    id: "repair-window-1-elapsed",
    atMs: REPAIR_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first active migration-repair window has elapsed.",
    setTriggers: { repairWindow1Elapsed: true },
  },
  {
    id: "repair-window-2-elapsed",
    atMs: REPAIR_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second active migration-repair window has elapsed.",
    setTriggers: { repairWindow1Elapsed: true, repairWindow2Elapsed: true },
  },
  {
    id: "repair-fully-done",
    atMs: REPAIR_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough active migration-repair time has elapsed for a fully-engaged reconciliation pass to have processed the entire already-written backlog.",
    setTriggers: {
      repairWindow1Elapsed: true,
      repairWindow2Elapsed: true,
      repairFullyDone: true,
    },
  },
  {
    id: "catastrophic-widening",
    atMs: CATASTROPHIC_WIDENING_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The rollout has continued completely unaddressed for a sustained period — the already-incompatible write backlog has grown to a scale that threatens a catastrophic, irrecoverable correctness collapse.",
    setTriggers: { rolloutRegressionActive: true, sustainedRollout: true, catastrophicWidening: true },
  },
];
