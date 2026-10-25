import type { TimedEvent } from "@incidentrank/simulator";

// The incident starts already mid-migration: New App Fleet has been
// live at appRolloutPercent=50 for a while, writing legacy-shape rows
// it cannot correctly populate without the new field, before the
// candidate is paged. This marks "the candidate has been notified / is
// now watching," not the literal start of the rollout.
const COMPATIBILITY_BROKEN_ACTIVE_MS = 20_000;

// Natural/organic escalation: if the write-shape mismatch is left
// unaddressed, both fleets keep writing at their ordinary rate, so the
// new-shape-only row population keeps growing at an accelerating rate
// the longer it runs unaddressed.
const COMPATIBILITY_ESCALATES_MS = COMPATIBILITY_BROKEN_ACTIVE_MS + 3 * 60_000;

// RECOVERY-LAG window (phase6d3.md section 14, binding): backfill
// cannot be assumed to finish the instant it is turned on. This trigger
// fires a fixed, real number of simulated minutes after backfill would
// need to have been running continuously to have fully repaired a
// bounded backlog — rules.ts gates the fully-repaired ("safe")
// values on this trigger in combination with backfillConcurrency
// actually having been active (not "off") for the whole window.
const BACKFILL_WINDOW_ELAPSED_MS = COMPATIBILITY_BROKEN_ACTIVE_MS + 5 * 60_000;

// Intermediate recovery-lag checkpoint: a real, fixed amount of
// simulated time must pass with backfill actively running before the
// backlog has drained far enough to even be CONSIDERED bounded
// (acceptableCondition's threshold). Without this checkpoint, the very
// first tick after turning backfill on could otherwise satisfy the
// acceptable bar, defeating the recovery-lag requirement.
const BACKFILL_PARTIALLY_DRAINED_MS = COMPATIBILITY_BROKEN_ACTIVE_MS + 90_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "compatibility-broken-active",
    atMs: COMPATIBILITY_BROKEN_ACTIVE_MS,
    type: "TRIGGER_SET",
    message:
      "New App Fleet is live and serving real traffic while compatibility write mode is still legacy-shape. New App Fleet cannot correctly omit the new field it depends on, so it has begun writing new-shape-only rows Old App Fleet cannot safely interpret.",
    setTriggers: { compatibilityBrokenActive: true },
  },
  // NOTE: ordered strictly by ascending atMs — the engine processes
  // timedEvents by array position, never by sorting atMs.
  {
    id: "backfill-partially-drained",
    atMs: BACKFILL_PARTIALLY_DRAINED_MS,
    type: "TRIGGER_SET",
    message:
      "A backfill process that has been running continuously has had enough time to repair the row-shape backlog to a materially smaller, bounded size, provided backfill has actually been active.",
    setTriggers: {
      compatibilityBrokenActive: true,
      backfillPartiallyDrained: true,
    },
  },
  {
    id: "compatibility-escalates",
    atMs: COMPATIBILITY_ESCALATES_MS,
    type: "TRIGGER_SET",
    message:
      "Both fleets keep writing at their ordinary rate. Left unaddressed, the new-shape-only row count is now growing faster than before.",
    setTriggers: {
      compatibilityBrokenActive: true,
      backfillPartiallyDrained: true,
      compatibilityEscalated: true,
    },
  },
  {
    id: "backfill-window-elapsed",
    atMs: BACKFILL_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for a continuously running backfill process to have fully repaired the historical row-shape backlog, provided one has actually been running the whole window.",
    setTriggers: {
      compatibilityBrokenActive: true,
      backfillPartiallyDrained: true,
      compatibilityEscalated: true,
      backfillWindowElapsed: true,
    },
  },
];

export {
  COMPATIBILITY_BROKEN_ACTIVE_MS,
  BACKFILL_PARTIALLY_DRAINED_MS,
  COMPATIBILITY_ESCALATES_MS,
  BACKFILL_WINDOW_ELAPSED_MS,
};
