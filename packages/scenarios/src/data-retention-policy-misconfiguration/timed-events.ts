import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the Deletion Service's retention policy rollout has
// gone out misconfigured — Financial Records in scope begin being
// wrongly purged from the Archive. Application and Event Store are
// unaffected on uptime/write-success.
export const MISCONFIGURATION_DISCOVERED_MS = 20_000;

// If the misconfigured policy is left unaddressed this long, the
// cumulative wrongly-deleted count has compounded into a materially
// larger, more serious exposure window — modeling a compliance problem
// whose damage compounds the longer it runs, not a fixed one-time blip.
export const SUSTAINED_MISCONFIGURATION_MS = MISCONFIGURATION_DISCOVERED_MS + 3 * 60_000;

// Recovery-lag drain windows (same binding historical-damage/recovery-
// lag doctrine as Model Feature Freshness Degradation and Data Pipeline
// Freshness Collapse): once the candidate has genuinely engaged a safe,
// correctly-scoped configuration (Financial Records protected from
// further wrongful deletion AND legal holds enforced), the compliance
// rate does not jump to 100 on the next tick — the Deletion Service
// needs real elapsed time to finish re-validating every in-scope record
// against the corrected rule before the fleet-wide compliance rate
// genuinely reads fully healthy. Anchored AFTER
// SUSTAINED_MISCONFIGURATION_MS so they are reachable even when the
// candidate let the exposure compound first.
export const DRAIN_WINDOW_1_MS = SUSTAINED_MISCONFIGURATION_MS + 2 * 60_000;
export const DRAIN_WINDOW_FULLY_RECOVERED_MS = SUSTAINED_MISCONFIGURATION_MS + 5 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "misconfiguration-discovered",
    atMs: MISCONFIGURATION_DISCOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: the Deletion Service's most recent retention-policy rollout is misconfigured — Financial Records in scope are being wrongly purged from the Archive. Application uptime and Event Store write success remain unaffected; this is a compliance problem, not an availability problem.",
    setTriggers: { retentionMisconfigured: true },
  },
  {
    id: "sustained-misconfiguration",
    atMs: SUSTAINED_MISCONFIGURATION_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "EXTERNAL PROGRESSION: the misconfigured retention policy has persisted long enough that the cumulative wrongly-deleted Financial Records exposure has compounded into a materially larger, more serious window.",
    setTriggers: { retentionMisconfigured: true, sustainedMisconfiguration: true },
  },
  // NOTE: drain-window triggers below fire unconditionally on wall-clock
  // atMs, exactly like every other timed event in this engine. rules.ts
  // is what makes them MEANINGFUL only once the candidate has actually
  // engaged a safe, correctly-scoped configuration.
  {
    id: "drain-window-1-elapsed",
    atMs: DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a first compliance re-validation window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true },
  },
  {
    id: "drain-window-fully-recovered-elapsed",
    atMs: DRAIN_WINDOW_FULLY_RECOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough re-validation time has elapsed for a fully-engaged, correctly-scoped fix to have brought Financial Records compliance all the way back to its healthy bound.",
    setTriggers: { drainWindow1Elapsed: true, drainWindowFullyRecoveredElapsed: true },
  },
];
