import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the Stream Processor begins falling behind real-time.
// Source Systems and Ingestion are unaffected.
export const LAG_ONSET_MS = 20_000;

// If the lag is left unaddressed this long, backlog has compounded into
// a materially larger, more dangerous state — modeling a bottleneck
// whose damage compounds the longer it runs, not a fixed one-time blip.
// This also gates when Tier-1 freshness itself starts slipping if
// dataset priority was never engaged.
export const SUSTAINED_LAG_MS = LAG_ONSET_MS + 3 * 60_000;

// Drop-events exposure window: if the forbidden dropEvents lever has
// been left on this long while a real backlog exists, a bounded number
// of additional events have genuinely been discarded (droppedEventCount
// ratchets forward here) — modeling the fact that leaving an unsafe
// lever engaged for longer causes strictly more permanent damage, same
// pattern as Ledger Reconciliation Divergence / Event Platform Partial
// Outage's historical-damage windows. Deliberately anchored WELL BEFORE
// SUSTAINED_LAG_MS (not after it) and the rule it gates requires
// sustainedLag to be FALSE — so this window only ever matters strictly
// before sustainedLag fires, never overlapping the safe-scaling/drain-
// window timeline below at all. A candidate exercising the safe-scaling
// path (which this scenario's tests only ever engage at/after
// SUSTAINED_LAG_MS) never passes through this trigger's relevant window
// while sustainedLag is still false, so it can never shadow the real
// recovery progression.
export const DROP_EXPOSURE_WINDOW_MS = LAG_ONSET_MS + 45_000;

// Recovery-lag drain windows (phase6d3.md section 14, binding): once the
// candidate has genuinely stopped new backlog growth AND protected the
// Warehouse (safe processor concurrency + dataset priority + either low-
// priority throttle or backpressure), the Tier-2 backlog does not vanish
// on the next tick — it drains across these successive, real-elapsed-
// time windows. Anchored AFTER SUSTAINED_LAG_MS so they are reachable
// even when the candidate let the backlog compound first; rules.ts is
// what makes them MEANINGFUL only once the candidate has actually
// engaged a safe draining configuration — a candidate who never does
// never matches any draining-tier rule no matter how many of these
// triggers have fired.
export const DRAIN_WINDOW_1_MS = SUSTAINED_LAG_MS + 2 * 60_000;
export const DRAIN_WINDOW_2_MS = SUSTAINED_LAG_MS + 5 * 60_000;
export const DRAIN_WINDOW_FULLY_RECOVERED_MS = SUSTAINED_LAG_MS + 9 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below MUST therefore already be in strictly
// ascending atMs order, or a later-in-array-but-earlier-in-time event
// (like DROP_EXPOSURE_WINDOW_MS, which is before SUSTAINED_LAG_MS) would
// never fire at all, since the pointer would stall on an earlier array
// slot whose atMs hasn't been reached yet.
export const timedEvents: TimedEvent[] = [
  {
    id: "lag-onset",
    atMs: LAG_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "The Stream Processor has begun falling behind real-time. Source Systems and Ingestion success remain unaffected.",
    setTriggers: { processorLagging: true },
  },
  {
    id: "drop-exposure-window-elapsed",
    atMs: DROP_EXPOSURE_WINDOW_MS,
    type: "TRIGGER_SET",
    message: "A drop-events exposure window has elapsed.",
    setTriggers: { dropExposureWindowElapsed: true },
  },
  {
    id: "sustained-lag",
    atMs: SUSTAINED_LAG_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The processing lag has persisted long enough that the backlog has compounded into a materially larger, more dangerous state.",
    setTriggers: { processorLagging: true, sustainedLag: true },
  },
  // NOTE: drain-window triggers below fire unconditionally on wall-clock
  // atMs, exactly like every other timed event in this engine. rules.ts
  // is what makes them MEANINGFUL only once the candidate has actually
  // engaged a safe draining configuration.
  {
    id: "drain-window-1-elapsed",
    atMs: DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first backlog-drain window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true },
  },
  {
    id: "drain-window-2-elapsed",
    atMs: DRAIN_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second backlog-drain window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true, drainWindow2Elapsed: true },
  },
  {
    id: "drain-window-fully-recovered-elapsed",
    atMs: DRAIN_WINDOW_FULLY_RECOVERED_MS,
    type: "TRIGGER_SET",
    message: "Enough drain time has elapsed for a fully-engaged safe configuration to have caught the backlog up to zero.",
    setTriggers: {
      drainWindow1Elapsed: true,
      drainWindow2Elapsed: true,
      drainWindowFullyRecoveredElapsed: true,
    },
  },
];
