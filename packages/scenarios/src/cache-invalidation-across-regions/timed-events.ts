import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the Invalidation Stream / Publisher begins delivering
// asymmetrically across regions — delayed in US, duplicated/replayed in
// EU, healthy in APAC. Global API itself never degrades.
export const INCIDENT_ONSET_MS = 20_000;

// If left unaddressed this long, the US staleness window and EU's
// replay storm have both been running long enough that materially more
// stale-serve damage has accrued (historical counter escalates into a
// worse authored band) — modeling damage that compounds the longer the
// desync runs, not a fixed one-time blip.
export const SUSTAINED_DESYNC_MS = INCIDENT_ONSET_MS + 4 * 60_000;

// Recovery-lag windows (phase6d3.md section 14, binding): once the
// candidate has genuinely fixed US's freshness problem (bypass, SWR, or
// a short-enough effective TTL) AND stopped EU's replay storm
// (deduplicated), the system does NOT snap to green on the next tick.
// US's delayed invalidation stream needs real elapsed time to actually
// catch up and drain its backlog of in-flight delayed messages; EU's
// cache needs real elapsed time to re-warm after the storm stops
// evicting it; Origin needs real elapsed time for request volume to
// settle back down from whatever bypass/storm pressure was hitting it.
// These fire unconditionally on wall-clock atMs like every timed event
// in this engine (see ledger-reconciliation-divergence/timed-events.ts's
// identical note) — rules.ts is what makes them MEANINGFUL only once
// the candidate has actually applied a real fix; a candidate who never
// fixes anything never matches any recovering-tier rule no matter how
// many of these windows have elapsed.
export const RECOVERY_WINDOW_1_MS = SUSTAINED_DESYNC_MS + 90_000;
export const RECOVERY_WINDOW_2_MS = SUSTAINED_DESYNC_MS + 3 * 60_000;
export const RECOVERY_WINDOW_FULL_MS = SUSTAINED_DESYNC_MS + 6 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "invalidation-desync-onset",
    atMs: INCIDENT_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "The Invalidation Stream is delivering asymmetrically: US Cache invalidations are delayed, EU Cache invalidations are being duplicated/replayed, and APAC Cache remains healthy. Global API success is unaffected.",
    setTriggers: { invalidationDesyncActive: true },
  },
  {
    id: "sustained-desync",
    atMs: SUSTAINED_DESYNC_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The invalidation desync has been active long enough that stale-serve damage in US and revalidation-storm load in EU have both compounded materially.",
    setTriggers: { invalidationDesyncActive: true, sustainedDesync: true },
  },
  // NOTE: recovery-window triggers below fire unconditionally on
  // wall-clock atMs, exactly like every other timed event in this
  // engine. rules.ts gates on BOTH the trigger AND the current control
  // values, so these only become meaningful once a genuine fix is
  // actually in effect.
  {
    id: "recovery-window-1-elapsed",
    atMs: RECOVERY_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first recovery window has elapsed.",
    setTriggers: { recoveryWindow1Elapsed: true },
  },
  {
    id: "recovery-window-2-elapsed",
    atMs: RECOVERY_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second recovery window has elapsed.",
    setTriggers: { recoveryWindow1Elapsed: true, recoveryWindow2Elapsed: true },
  },
  {
    id: "recovery-window-full-elapsed",
    atMs: RECOVERY_WINDOW_FULL_MS,
    type: "TRIGGER_SET",
    message:
      "Enough recovery time has elapsed for a genuinely-fixed invalidation path to have fully caught up and for Origin/EU cache to have fully re-stabilized.",
    setTriggers: {
      recoveryWindow1Elapsed: true,
      recoveryWindow2Elapsed: true,
      recoveryWindowFullElapsed: true,
    },
  },
];
