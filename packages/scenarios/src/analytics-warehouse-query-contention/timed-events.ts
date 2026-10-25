import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: a month-end-close-style surge in ad-hoc BI/Data Science
// query load begins contending with the critical Scheduled Reports job
// for the same Query Gateway admission slots.
export const CONTENTION_ONSET_MS = 20_000;

// If contention is left unaddressed this long, the critical report job's
// queue wait has compounded enough that its SLA deadline is now
// genuinely at risk — modeling a deadline that erodes the longer
// contention goes unaddressed, not a fixed one-time blip.
export const SUSTAINED_CONTENTION_MS = CONTENTION_ONSET_MS + 2 * 60_000;

// Recovery-lag drain windows (phase6e3.md's recovery-lag doctrine, same
// pattern as Model Feature Freshness Degradation / Data Pipeline
// Freshness Collapse): once the candidate has genuinely engaged
// priority-queue admission, the existing ad-hoc backlog does not drain
// to zero on the next tick — queued ad-hoc load and report queue wait
// drain across these successive, real-elapsed-time windows as
// already-admitted ad-hoc queries finish and new admissions respect the
// new ordering.
export const DRAIN_WINDOW_1_MS = SUSTAINED_CONTENTION_MS + 90_000;
export const DRAIN_WINDOW_FULLY_RECOVERED_MS = SUSTAINED_CONTENTION_MS + 4 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "contention-onset",
    atMs: CONTENTION_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: a month-end-close-style surge in ad-hoc BI/Data Science query load has begun contending with the critical Scheduled Reports job for Query Gateway admission slots.",
    setTriggers: { queryContention: true },
  },
  {
    id: "sustained-contention",
    atMs: SUSTAINED_CONTENTION_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "EXTERNAL PROGRESSION: contention has persisted long enough that the critical report job's queue wait has compounded into a materially larger share of its remaining SLA buffer.",
    setTriggers: { queryContention: true, sustainedContention: true },
  },
  // NOTE: drain-window triggers below fire unconditionally on wall-clock
  // atMs, exactly like every other timed event in this engine. rules.ts
  // is what makes them MEANINGFUL only once the candidate has actually
  // engaged a safe configuration.
  {
    id: "drain-window-1-elapsed",
    atMs: DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a first queue-drain window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true },
  },
  {
    id: "drain-window-fully-recovered-elapsed",
    atMs: DRAIN_WINDOW_FULLY_RECOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough drain time has elapsed for a fully-engaged prioritization strategy to have cleared the ad-hoc backlog and restored the report job's full SLA buffer.",
    setTriggers: { drainWindow1Elapsed: true, drainWindowFullyRecoveredElapsed: true },
  },
];
