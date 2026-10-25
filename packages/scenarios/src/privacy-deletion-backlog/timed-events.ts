import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: downstream deletion execution has fallen behind
// acceptance — a real backlog begins forming. Acceptance itself never
// degrades (requestAcceptanceSuccessRate stays at 100 throughout).
export const BACKLOG_DISCOVERED_MS = 20_000;

// If the backlog is left unaddressed this long, it has compounded into a
// materially larger, more serious exposure window — modeling a problem
// whose damage compounds the longer it runs, not a fixed one-time blip
// (same doctrine as Data Retention Policy Misconfiguration's
// SUSTAINED_MISCONFIGURATION_MS).
export const SUSTAINED_BACKLOG_MS = BACKLOG_DISCOVERED_MS + 3 * 60_000;

// Recovery-lag drain windows (same binding historical-damage/recovery-
// lag doctrine as every Phase 6E sibling): once the candidate has
// genuinely engaged a safe strategy (verified completion marking, real
// prioritization that protects deadline-nearest/high-risk requests), the
// backlog does not clear to zero on the next tick — the Workflow Queue
// needs real elapsed time to actually drain it. Anchored AFTER
// SUSTAINED_BACKLOG_MS so they are reachable even when the candidate let
// the backlog compound first.
export const DRAIN_WINDOW_1_MS = SUSTAINED_BACKLOG_MS + 2 * 60_000;
export const DRAIN_WINDOW_FULLY_RECOVERED_MS = SUSTAINED_BACKLOG_MS + 5 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "backlog-discovered",
    atMs: BACKLOG_DISCOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: deletion requests continue to be accepted successfully, but downstream execution across the Workflow Queue's fan-out (Product Databases, Analytics Store, Backup Index) is falling behind. A real completion backlog is forming. Request acceptance rate remains unaffected; this is an execution-completeness problem, not an availability problem.",
    setTriggers: { backlogForming: true },
  },
  {
    id: "sustained-backlog",
    atMs: SUSTAINED_BACKLOG_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "EXTERNAL PROGRESSION: the deletion backlog has persisted long enough that the oldest unresolved requests are now materially older and more deadline-exposed than when the backlog first formed.",
    setTriggers: { backlogForming: true, sustainedBacklog: true },
  },
  // NOTE: drain-window triggers below fire unconditionally on wall-clock
  // atMs, exactly like every other timed event in this engine. rules.ts
  // is what makes them MEANINGFUL only once the candidate has actually
  // engaged a safe, correctly-scoped strategy.
  {
    id: "drain-window-1-elapsed",
    atMs: DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a first backlog-draining window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true },
  },
  {
    id: "drain-window-fully-recovered-elapsed",
    atMs: DRAIN_WINDOW_FULLY_RECOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough draining time has elapsed for a fully-engaged, correctly-scoped strategy to have brought end-to-end completion all the way back to its healthy bound.",
    setTriggers: { drainWindow1Elapsed: true, drainWindowFullyRecoveredElapsed: true },
  },
];
