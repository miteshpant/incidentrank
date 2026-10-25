import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Caps how much of Region A's ORIGINAL traffic share the global router is
 * allowed to automatically redirect into Region B + Region C combined,
 * expressed as a percentage of Region A's own normal traffic. The
 * dangerous default, 100, is uncapped automatic failover — the router's
 * out-of-the-box behavior, which tries to preserve Region A's full
 * traffic volume by pushing all of it onto B/C regardless of whether they
 * have the reserve capacity to absorb it. Of Region A's original traffic,
 * 80 percentage points are business-critical customer operations that
 * must be served SOMEWHERE (Region A if restored, or failover within this
 * cap otherwise); the remaining 20 points are optional/low-priority
 * traffic that LOW_PRIORITY_TRAFFIC_KEY may shed instead of failing over.
 * Setting this cap below 80 while Region A is offline and optional
 * traffic is not shed means real critical traffic has nowhere to go and
 * is dropped outright — a distinct, separate harmful outcome from
 * overloading B/C.
 */
export const FAILOVER_CAP_KEY = "failoverCap";

/**
 * Whether optional/low-priority traffic (bulk exports, non-critical
 * background reads, deferrable reporting calls) is shed at the router
 * rather than being forwarded anywhere. "serve" (the default) keeps
 * trying to serve it, competing for the same limited Region B/C capacity
 * as critical traffic. "shed" drops only this bounded, named optional
 * share — freeing exactly the headroom needed to keep critical traffic
 * safely within FAILOVER_CAP_KEY without having to raise the cap itself.
 */
export const LOW_PRIORITY_TRAFFIC_KEY = "lowPriorityTrafficPolicy";

/**
 * Global cache-protection mode for Region B and Region C's caches.
 * "off" (default) means a sudden wave of previously-Region-A-local
 * traffic arrives at B/C with cold cache keys and stampedes straight
 * through to the database on every request. "on" enables request
 * coalescing / stale-while-revalidate behavior so concurrent misses on
 * the same key collapse into one origin fetch, protecting the cache hit
 * rate and, downstream, the database tier from a thundering herd caused
 * specifically by the failover traffic shift.
 */
export const CACHE_PROTECTION_KEY = "cacheProtectionMode";

/**
 * Database connection concurrency limit in Region B and Region C.
 * "uncapped" (default) lets failover traffic open as many DB connections
 * as arrive, which is exactly how a traffic surge turns into DB
 * saturation and, eventually, DB-tier failure. "capped" bounds concurrent
 * DB connections per region, converting excess load into bounded request
 * queuing/latency at the API tier instead of letting it saturate and
 * destabilize the database itself.
 */
export const DB_CONCURRENCY_KEY = "dbConcurrencyMode";

/**
 * Region A's own recovered capacity. "offline" (the incident default)
 * means Region A can serve none of its own traffic. "partial" means
 * Region A has recovered enough capacity to safely take back some of its
 * original traffic share. "full" means Region A is fully healthy again.
 * Recovering this is necessary but not sufficient to safely restore
 * traffic — see TRAFFIC_RESTORE_PACE_KEY and the recovery-lag window
 * documented in rules.ts: Region A's own health and B/C's drained/
 * recovered state are two independent things that both have to be true.
 */
export const REGION_A_RESTORATION_KEY = "regionARestorationMode";

/**
 * How quickly traffic is shifted back toward Region A once it reports
 * recovered capacity. "hold" (default) keeps the current failover
 * routing in place regardless of Region A's reported capacity. "instant"
 * immediately re-routes Region A's full original share back the moment
 * Region A reports any recovered capacity, without waiting for Region B/C
 * to actually finish draining the backlog/queue/cold-cache pressure they
 * accumulated during the failover window. "gradual" waits for Region B/C
 * to actually observe a drained, recovered state before shifting traffic
 * back, and does so incrementally. This is the control that makes
 * recovery-order matter: restoring too fast can retrigger the exact
 * overload this incident exists to prevent, even though Region A itself
 * is, by that point, telling the truth about its own health.
 */
export const TRAFFIC_RESTORE_PACE_KEY = "trafficRestorePace";

export const controls: ControlDefinition[] = [
  {
    key: FAILOVER_CAP_KEY,
    allowedValues: [0, 25, 50, 80, 100],
    initialValue: 100,
  },
  {
    key: LOW_PRIORITY_TRAFFIC_KEY,
    allowedValues: ["serve", "shed"],
    initialValue: "serve",
  },
  {
    key: CACHE_PROTECTION_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: DB_CONCURRENCY_KEY,
    allowedValues: ["uncapped", "capped"],
    initialValue: "uncapped",
  },
  {
    key: REGION_A_RESTORATION_KEY,
    allowedValues: ["offline", "partial", "full"],
    initialValue: "offline",
  },
  {
    key: TRAFFIC_RESTORE_PACE_KEY,
    allowedValues: ["hold", "gradual", "instant"],
    initialValue: "hold",
  },
];
