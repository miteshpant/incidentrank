import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the Event Stream -> Settlement Ledger publisher path
// begins dropping some events and duplicating others. Nothing about the
// Transaction API or Operational Ledger changes — this is deliberately
// NOT an availability outage.
export const DIVERGENCE_ONSET_MS = 20_000;

// A second window: if the publisher bug is left unaddressed this long,
// enough divergence has accrued that it crosses into a materially worse
// band (both counters authored higher) — modeling a bug whose damage
// compounds the longer it runs, not a fixed one-time blip.
export const SUSTAINED_DIVERGENCE_MS = DIVERGENCE_ONSET_MS + 4 * 60_000;

// Repair-drain windows (phase6d.2 section 9/recovery-lag binding): once
// the candidate has genuinely stopped new divergence AND engaged real
// repair throughput (active-exception-routing + auto-repair), the
// backlog does not vanish on the next tick — it drains across these
// three successive, real-elapsed-time windows, each with its own lower
// authored backlog value in rules.ts. Anchored AFTER
// SUSTAINED_DIVERGENCE_MS (not from absolute simulation-start 0) so
// they are reachable at all once a candidate has let the bug run long
// enough to compound — these fire unconditionally on wall-clock atMs
// like every timed event in this engine; rules.ts is what makes them
// MEANINGFUL only once the candidate has actually engaged
// active-exception-routing + auto-repair (the rule conditions gate on
// control values too, not on the trigger alone). A candidate who never
// engages repair never matches any draining-tier rule no matter how
// many of these triggers have fired, and a candidate who engages
// repair exactly when the publisher is fixed (the earliest possible
// moment, right at SUSTAINED_DIVERGENCE_MS) experiences these as "N
// minutes after I started repairing," which is what this scenario's
// recovery-lag narrative requires.
export const REPAIR_WINDOW_1_MS = SUSTAINED_DIVERGENCE_MS + 2 * 60_000;
export const REPAIR_WINDOW_2_MS = SUSTAINED_DIVERGENCE_MS + 5 * 60_000;
export const REPAIR_WINDOW_FULLY_DRAINED_MS = SUSTAINED_DIVERGENCE_MS + 9 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "divergence-onset",
    atMs: DIVERGENCE_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "The Event Stream to Settlement Ledger publisher has begun dropping a subset of financial events and duplicating others. Transaction API success and Operational Ledger health are unaffected.",
    setTriggers: { publisherBugActive: true },
  },
  {
    id: "sustained-divergence",
    atMs: SUSTAINED_DIVERGENCE_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The publisher defect has been active long enough that missing and duplicate settlement entries have compounded into a materially larger backlog.",
    setTriggers: { publisherBugActive: true, sustainedDivergence: true },
  },
  // NOTE: repair-window triggers below fire unconditionally on
  // wall-clock atMs, exactly like every other timed event in this
  // engine (tickOnce processes timedEvents strictly by ascending
  // array position / atMs, never relative to "when a control was
  // set"). rules.ts is what makes them MEANINGFUL only once the
  // candidate has actually engaged active-exception-routing +
  // auto-repair — the rule conditions gate on the control values too,
  // not on the trigger alone. A candidate who never engages repair
  // never matches any of the draining-tier rules, no matter how many
  // of these triggers have fired.
  {
    id: "repair-window-1-elapsed",
    atMs: REPAIR_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first repair-throughput window has elapsed.",
    setTriggers: { repairWindow1Elapsed: true },
  },
  {
    id: "repair-window-2-elapsed",
    atMs: REPAIR_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second repair-throughput window has elapsed.",
    setTriggers: { repairWindow1Elapsed: true, repairWindow2Elapsed: true },
  },
  {
    id: "repair-window-fully-drained-elapsed",
    atMs: REPAIR_WINDOW_FULLY_DRAINED_MS,
    type: "TRIGGER_SET",
    message: "Enough repair-throughput time has elapsed for a fully-engaged repair process to have drained the backlog to zero.",
    setTriggers: {
      repairWindow1Elapsed: true,
      repairWindow2Elapsed: true,
      repairWindowFullyDrainedElapsed: true,
    },
  },
];
