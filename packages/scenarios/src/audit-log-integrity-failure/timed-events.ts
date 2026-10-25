import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: an upstream delivery degradation between the Event
// Stream and the Immutable Store begins causing audit events to arrive
// missing, duplicated, or out of order, and some events lose their
// verifiable evidence entirely. Services and the Audit Logger are
// unaffected on uptime/write-success.
export const DEGRADATION_DISCOVERED_MS = 20_000;

// If the degradation is left unaddressed this long, the cumulative
// unverifiable-event exposure has compounded into a materially larger,
// more serious window — modeling an evidence-integrity problem whose
// damage compounds the longer it runs, not a fixed one-time blip.
export const SUSTAINED_DEGRADATION_MS = DEGRADATION_DISCOVERED_MS + 3 * 60_000;

// Recovery-lag drain windows (same binding historical-damage/recovery-
// lag doctrine as Data Retention Policy Misconfiguration): once the
// candidate has genuinely engaged a safe reconciliation strategy, the
// backlog does not drop to zero on the next tick — reconciliation needs
// real elapsed time to replay and cross-check every queued event
// against trustworthy evidence before completeness/ordering confidence
// genuinely reads fully healthy. Anchored AFTER SUSTAINED_DEGRADATION_MS
// so they are reachable even when the candidate let the exposure
// compound first.
export const DRAIN_WINDOW_1_MS = SUSTAINED_DEGRADATION_MS + 2 * 60_000;
export const DRAIN_WINDOW_FULLY_RECONCILED_MS = SUSTAINED_DEGRADATION_MS + 5 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "degradation-discovered",
    atMs: DEGRADATION_DISCOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: an upstream delivery degradation between the Event Stream and the Immutable Store is causing audit events to arrive missing, duplicated, or out of order, and some events are losing verifiable evidence entirely. Services uptime and Audit Logger write-success remain unaffected; this is an evidence-integrity problem, not an availability problem.",
    setTriggers: { evidenceDegraded: true },
  },
  {
    id: "sustained-degradation",
    atMs: SUSTAINED_DEGRADATION_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "EXTERNAL PROGRESSION: the evidence-integrity degradation has persisted long enough that the cumulative unverifiable-event exposure has compounded into a materially larger, more serious window.",
    setTriggers: { evidenceDegraded: true, sustainedDegradation: true },
  },
  // NOTE: drain-window triggers below fire unconditionally on wall-clock
  // atMs, exactly like every other timed event in this engine. rules.ts
  // is what makes them MEANINGFUL only once the candidate has actually
  // engaged a genuinely safe reconciliation strategy.
  {
    id: "drain-window-1-elapsed",
    atMs: DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a first reconciliation window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true },
  },
  {
    id: "drain-window-fully-reconciled-elapsed",
    atMs: DRAIN_WINDOW_FULLY_RECONCILED_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough reconciliation time has elapsed for a fully-engaged, correctly-scoped response to have brought event completeness and ordering confidence all the way back to their healthy bound.",
    setTriggers: { drainWindow1Elapsed: true, drainWindowFullyReconciledElapsed: true },
  },
];
