import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the Feature Pipeline begins falling behind real-time.
// Model Serving and Decision API are unaffected on uptime/latency.
export const LAG_ONSET_MS = 20_000;

// If the lag is left unaddressed this long, feature age has compounded
// into a materially larger, more dangerous staleness window — modeling a
// freshness problem whose risk compounds the longer it runs, not a
// fixed one-time blip.
export const SUSTAINED_LAG_MS = LAG_ONSET_MS + 3 * 60_000;

// Recovery-lag drain windows (phase6e2.md's binding historical-damage/
// recovery-lag doctrine, same pattern as Data Pipeline Freshness
// Collapse): once the candidate has genuinely engaged a safe
// configuration (critical decisions protected from stale features by
// ANY of the three real levers), featureFreshnessAgeSeconds and
// featurePipelineLagSeconds do not drop to healthy on the next tick —
// they drain across these successive, real-elapsed-time windows.
// Anchored AFTER SUSTAINED_LAG_MS so they are reachable even when the
// candidate let staleness compound first.
export const DRAIN_WINDOW_1_MS = SUSTAINED_LAG_MS + 2 * 60_000;
export const DRAIN_WINDOW_2_MS = SUSTAINED_LAG_MS + 4 * 60_000;
export const DRAIN_WINDOW_FULLY_RECOVERED_MS = SUSTAINED_LAG_MS + 7 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "lag-onset",
    atMs: LAG_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: the Feature Pipeline has begun falling behind real-time. Model Serving uptime and Decision API latency remain unaffected — this is a freshness problem, not an availability problem.",
    setTriggers: { pipelineLagging: true },
  },
  {
    id: "sustained-lag",
    atMs: SUSTAINED_LAG_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "EXTERNAL PROGRESSION: the feature pipeline lag has persisted long enough that served feature age has compounded into a materially larger, more dangerous staleness window.",
    setTriggers: { pipelineLagging: true, sustainedLag: true },
  },
  // NOTE: drain-window triggers below fire unconditionally on wall-clock
  // atMs, exactly like every other timed event in this engine. rules.ts
  // is what makes them MEANINGFUL only once the candidate has actually
  // engaged a safe configuration.
  {
    id: "drain-window-1-elapsed",
    atMs: DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a first feature-freshness drain window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true },
  },
  {
    id: "drain-window-2-elapsed",
    atMs: DRAIN_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a second feature-freshness drain window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true, drainWindow2Elapsed: true },
  },
  {
    id: "drain-window-fully-recovered-elapsed",
    atMs: DRAIN_WINDOW_FULLY_RECOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough drain time has elapsed for a fully-engaged safe configuration to have caught feature freshness all the way back to its healthy bound.",
    setTriggers: {
      drainWindow1Elapsed: true,
      drainWindow2Elapsed: true,
      drainWindowFullyRecoveredElapsed: true,
    },
  },
];
