import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the upstream complexity classifier degrades, so the
// Routing Layer's "classifier-only" default starts sending far more
// traffic to the Large Model than genuinely necessary. Routing Layer
// uptime and inference latency are unaffected.
export const MISROUTE_ONSET_MS = 20_000;

// If left unaddressed this long, the misroute has compounded: traffic
// share on the Large Model keeps climbing and cumulative exposure from
// any silent-downgrade lever keeps accruing — modeling a cost/quality
// problem that compounds the longer it runs, not a fixed one-time blip.
export const SUSTAINED_MISROUTE_MS = MISROUTE_ONSET_MS + 3 * 60_000;

// Alternate Strong Path A's recovery-lag drain windows (phase6e3's
// binding historical-damage/recovery-lag doctrine, same pattern as
// Model Feature Freshness Degradation's drain windows). Once the
// candidate has genuinely dispatched a classifier fix
// (classifierRemediation = true) while routingPolicy stays
// "classifier-only" (the only configuration in which fixing the
// classifier has anything left to improve), the rollout does not
// complete on the next tick — it drains across these successive,
// real-elapsed-time windows. Anchored AFTER SUSTAINED_MISROUTE_MS so
// they are reachable even when the candidate let the misroute compound
// first.
export const CLASSIFIER_FIX_WINDOW_1_MS = SUSTAINED_MISROUTE_MS + 2 * 60_000;
export const CLASSIFIER_FIX_FULLY_ROLLED_OUT_MS = SUSTAINED_MISROUTE_MS + 5 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "misroute-onset",
    atMs: MISROUTE_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: the upstream request-complexity classifier has degraded. The Routing Layer's default policy blindly trusts its verdict, so traffic share on the Large Model is climbing well beyond what request complexity actually requires. Routing Layer uptime and inference latency remain unaffected — this is a cost/quality-tradeoff problem, not an availability problem.",
    setTriggers: { misrouteActive: true },
  },
  {
    id: "sustained-misroute",
    atMs: SUSTAINED_MISROUTE_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "EXTERNAL PROGRESSION: the misroute has persisted long enough that Large Model traffic share and monthly inference spend have compounded into a materially larger, more expensive exposure window.",
    setTriggers: { misrouteActive: true, sustainedMisroute: true },
  },
  // NOTE: classifier-fix-window triggers below fire unconditionally on
  // wall-clock atMs, exactly like every other timed event in this
  // engine. rules.ts is what makes them MEANINGFUL only once the
  // candidate has actually dispatched the fix while routingPolicy is
  // still "classifier-only".
  {
    id: "classifier-fix-window-1-elapsed",
    atMs: CLASSIFIER_FIX_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a first classifier-remediation rollout window has elapsed.",
    setTriggers: { classifierFixWindow1Elapsed: true },
  },
  {
    id: "classifier-fix-fully-rolled-out",
    atMs: CLASSIFIER_FIX_FULLY_ROLLED_OUT_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough rollout time has elapsed for a dispatched classifier fix to have fully restored correct routing decisions.",
    setTriggers: { classifierFixWindow1Elapsed: true, classifierFixFullyRolledOut: true },
  },
];
