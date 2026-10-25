import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * US Cache's own read path. The Invalidation Stream is DELAYED in US —
 * writes to Origin take real time to show up as an invalidation in US
 * Cache, so US keeps serving an old cached value past the freshness
 * bound while waiting for a delayed invalidation to arrive. "caching"
 * (default) keeps serving from cache (stale, bounded only by TTL) while
 * the delayed invalidation eventually catches up. "bypass" routes every
 * US Cache read straight to Origin Store — this fixes US freshness
 * immediately, but now every US request is an Origin request, not a
 * cache hit, for as long as bypass stays on. This is the scenario's
 * TARGETED (regional-only) version of the bypass lever, contrasted
 * deliberately with GLOBAL_CACHE_BYPASS_KEY below.
 */
export const US_CACHE_MODE_KEY = "usCacheMode";

/**
 * EU's invalidation stream consumer is duplicating/replaying the same
 * invalidation messages. "blind-replay" (default/root cause) re-applies
 * every duplicate invalidation it receives as a brand-new eviction +
 * re-fetch, even for a key it just evicted and re-fetched moments ago —
 * this is what creates EU's revalidation storm: healthy keys get
 * evicted and re-fetched from Origin over and over for no reason other
 * than duplicate delivery. "deduplicated" recognizes a repeat
 * invalidation for a key already evicted within a short window and
 * drops it instead of re-processing it — this is the real, structural
 * fix for EU specifically: it stops the storm without touching US or
 * APAC's invalidation behavior at all.
 */
export const EU_INVALIDATION_REPLAY_MODE_KEY = "euInvalidationReplayMode";

/**
 * The scenario's REQUIRED tempting-but-harmful global lever (binding
 * pressure-transfer mechanism, phase6d3.md section 5). "false" (default)
 * leaves each region's cache serving normally except where a targeted
 * fix is applied. "true" disables caching GLOBALLY across US, EU, AND
 * APAC — including APAC, which was never broken and was carrying the
 * majority of steady-state read-hit traffic. Every region's read volume
 * now lands on Origin Store simultaneously, producing materially worse
 * Origin overload than targeting only the actually-broken region(s) —
 * see rules.ts's "global-bypass-origin-overload" state for the real,
 * authored numbers proving this is strictly worse than
 * US_CACHE_MODE_KEY=bypass alone.
 */
export const GLOBAL_CACHE_BYPASS_KEY = "globalCacheBypass";

/**
 * Origin Store's concurrent-request handling capacity. "normal"
 * (default) is Origin's steady-state provisioned capacity — enough for
 * ordinary cache-miss volume, not enough to absorb a full regional or
 * global bypass. "high" raises Origin's capacity so it survives more
 * concurrent load without its own latency collapsing — a real,
 * legitimate partial mitigant for whatever bypass/revalidation load is
 * currently happening, but it does nothing to stop the ROOT invalidation
 * desynchronization itself (US still serves stale reads past the
 * freshness bound; EU's storm still recurs) and costs real money (see
 * revenue-and-cost.ts). Capacity alone never reaches the optimal/
 * acceptable tier on its own.
 */
export const ORIGIN_CONCURRENCY_KEY = "originConcurrency";

/**
 * Serve the currently-cached (possibly stale) value immediately while
 * triggering exactly one background refresh per key, instead of either
 * blocking the caller on a synchronous Origin fetch or bypassing the
 * cache outright. "false" (default). "true" is central to this
 * scenario's legitimate ACCEPTABLE tier for US's delayed-invalidation
 * freshness problem: it bounds staleness (the refresh is always
 * in-flight, so served data is never older than one refresh cycle)
 * without routing every US request to Origin the way bypass does — a
 * genuinely different, lower-origin-pressure way to bound staleness,
 * not a weaker copy of bypass.
 */
export const STALE_WHILE_REVALIDATE_KEY = "staleWhileRevalidate";

/**
 * US Cache's entry lifetime. "short" (default, 30s) means US re-fetches
 * from Origin frequently on its own even without an invalidation ever
 * arriving — which, combined with the delayed invalidation stream,
 * means US is BOTH serving stale data past a 30s bound AND still
 * generating steady background Origin load from ordinary expiry.
 * "extended" (300s) and "long" (900s) raise the bound: Origin load from
 * ordinary TTL-driven re-fetching drops (fewer expiries per unit time),
 * but the WORST-CASE staleness window before a stale value naturally
 * expires (even with no fix applied at all) grows directly with it —
 * the explicit, authored tradeoff named in this scenario's business
 * invariant "a bounded stale-read window may be acceptable for selected
 * data classes," never a free lever.
 */
export const US_TTL_SECONDS_KEY = "usTtlSeconds";

/**
 * Whether EU's invalidator consumer has been isolated from the shared
 * Invalidation Stream / Publisher fan-out. "false" (default) means
 * EU's duplicate/replayed invalidation traffic is still being processed
 * through the SAME shared publisher connection every region reads from
 * — under high EU replay volume this measurably increases publisher
 * processing lag for US's (already-delayed) and APAC's invalidation
 * delivery too, a real cross-region contagion risk. "true" gives EU's
 * consumer its own isolated connection/lane to the publisher, so EU's
 * replay storm — however bad — can never add lag to US or APAC's
 * invalidation delivery. This is the scenario's direct implementation
 * of the business invariant "regional isolation is preferable to global
 * origin collapse": isolating the broken region's blast radius rather
 * than either accepting cross-region contagion or disabling invalidation
 * processing everywhere.
 */
export const REGIONAL_INVALIDATOR_ISOLATION_KEY = "regionalInvalidatorIsolation";

/**
 * How many concurrent revalidation fetches a region's cache may issue
 * against Origin while repopulating after an eviction/bypass/replay
 * event. "low" (default) repopulates conservatively — safer for Origin,
 * slower warmup. "high" repopulates faster per unit of elapsed time
 * once a real fix (deduplication, isolation, stale-while-revalidate)
 * is in effect, shortening the recovery-lag warmup window — but, while
 * EU is still actively replaying (blind-replay) or while global bypass
 * is active, "high" instead means more concurrent duplicate/bypassed
 * refetches hit Origin at once, measurably worsening Origin overload
 * rather than speeding any genuine recovery. The same control is a
 * real accelerant once fixed and a real amplifier while still broken —
 * never a no-op.
 */
export const REFRESH_CONCURRENCY_KEY = "refreshConcurrency";

export const controls: ControlDefinition[] = [
  {
    key: US_CACHE_MODE_KEY,
    allowedValues: ["caching", "bypass"],
    initialValue: "caching",
  },
  {
    key: EU_INVALIDATION_REPLAY_MODE_KEY,
    allowedValues: ["blind-replay", "deduplicated"],
    initialValue: "blind-replay",
  },
  {
    key: GLOBAL_CACHE_BYPASS_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: ORIGIN_CONCURRENCY_KEY,
    allowedValues: ["normal", "high"],
    initialValue: "normal",
  },
  {
    key: STALE_WHILE_REVALIDATE_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: US_TTL_SECONDS_KEY,
    allowedValues: [30, 300, 900],
    initialValue: 30,
  },
  {
    key: REGIONAL_INVALIDATOR_ISOLATION_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REFRESH_CONCURRENCY_KEY,
    allowedValues: ["low", "high"],
    initialValue: "low",
  },
];
