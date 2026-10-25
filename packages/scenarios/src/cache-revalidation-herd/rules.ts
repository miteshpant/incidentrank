import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  REFRESH_CONCURRENCY_LIMIT_KEY,
  REFRESH_RETRY_BACKOFF_KEY,
  SINGLE_FLIGHT_COALESCING_KEY,
  STALE_WHILE_REVALIDATE_ENABLED_KEY,
  TTL_JITTER_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-fleet": "healthy",
  "shared-cache": "healthy",
  origin: "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-fleet": "degraded",
  "shared-cache": "degraded",
  origin: "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-fleet": "critical",
  "shared-cache": "critical",
  origin: "critical",
};

const originCriticalFleetHealthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-fleet": "healthy",
  "shared-cache": "degraded",
  origin: "critical",
};

/**
 * Authored rule table for Cache Revalidation Herd, ordered most-specific
 * first. A batch of popular objects shares one flat, unjittered TTL.
 * When it expires, every API instance independently detects the
 * resulting miss at nearly the same moment and independently issues its
 * own origin refresh — origin QPS spikes far above steady-state, some
 * refreshes fail/time out under the saturation, and failed refreshes
 * retry, amplifying load further.
 *
 * Three genuinely different durable fixes exist, none of which depend on
 * raw capacity:
 *   1. ttlJitterEnabled — desynchronizes expiry at the source so the
 *      herd-forming trigger never fires at all: OPTIMAL.
 *   2. singleFlightCoalescingEnabled — lets the herd form (miss rate
 *      still spikes) but collapses every simultaneous same-key miss,
 *      fleet-wide, into exactly one real origin refresh: OPTIMAL
 *      (alternate good path).
 *   3. staleWhileRevalidateEnabled — never blocks callers on a
 *      synchronous refresh at all; stale data is served while one
 *      background refresh repopulates the key: OPTIMAL (alternate good
 *      path), at the cost of serving briefly stale data.
 *
 * Binding design requirement: apiInstanceCount and
 * refreshConcurrencyLimit, raised without any of the three fixes above,
 * must make origin QPS and concurrent refreshes WORSE than the
 * unmitigated baseline — more independent refreshers racing for the
 * same expired keys means more simultaneous origin requests for those
 * same keys, not fewer. refreshConcurrencyLimit raised alone (fleet size
 * unchanged) only lets origin absorb more of the existing herd's
 * duplicate requests at once without reducing how many exist — modeled
 * as a real but incomplete "masking" mitigation, distinct from the
 * instance-scaling trap which actively creates more duplicate
 * refreshers.
 */
export const cacheRevalidationHerdRules: Rule[] = [
  // ── Optimal recovery #1: TTL jitter. The herd's own forming trigger
  // never fires — objects no longer share one synchronized expiry
  // instant, so misses and refreshes stay spread out regardless of
  // every other control. Checked first so it wins once applied, even
  // mid-herd (jitter re-randomizes outstanding expiries going forward).
  {
    id: "ttl-jitter-recovery",
    when: {
      triggerEquals: { expiryApproaching: true },
      controlEquals: { [TTL_JITTER_ENABLED_KEY]: true },
    },
    incidentState: "jittered",
    values: {
      cacheMissRatePct: 3,
      concurrentRefreshes: 4,
      originQps: 90,
      originLatencyMs: 38,
      apiLatencyMs: 42,
      refreshFailureRatePct: 0,
      cacheHitRatioPct: 97,
      originStatus: "normal",
      revalidationMode: "jittered",
    },
    componentHealth: healthyHealth,
  },

  // ── Optimal recovery #2 (alternate good path): single-flight
  // coalescing. The herd still forms (the shared expiry still fires),
  // but every simultaneous same-key miss across the whole fleet
  // collapses into exactly one real origin refresh — origin QPS stays
  // near steady-state even though concurrentRefreshes briefly reflects
  // the fleet-wide miss event.
  {
    id: "single-flight-coalescing-recovery",
    when: {
      triggerEquals: { herdActive: true },
      controlEquals: { [SINGLE_FLIGHT_COALESCING_KEY]: true },
    },
    incidentState: "coalesced",
    values: {
      cacheMissRatePct: 55,
      concurrentRefreshes: 1,
      originQps: 95,
      originLatencyMs: 40,
      apiLatencyMs: 45,
      refreshFailureRatePct: 0,
      cacheHitRatioPct: 96,
      originStatus: "normal",
      revalidationMode: "coalesced",
    },
    componentHealth: healthyHealth,
  },

  // ── Optimal recovery #3 (alternate good path): stale-while-
  // revalidate. Callers are never blocked on a synchronous refresh at
  // all — the stale value is served immediately while exactly one
  // background refresh repopulates each key. API latency stays flat
  // throughout, at the accepted cost of briefly stale reads.
  {
    id: "stale-while-revalidate-recovery",
    when: {
      triggerEquals: { herdActive: true },
      controlEquals: { [STALE_WHILE_REVALIDATE_ENABLED_KEY]: true },
    },
    incidentState: "stale-served",
    values: {
      cacheMissRatePct: 55,
      concurrentRefreshes: 1,
      originQps: 85,
      originLatencyMs: 40,
      apiLatencyMs: 41,
      refreshFailureRatePct: 0,
      cacheHitRatioPct: 95,
      originStatus: "normal",
      revalidationMode: "stale-served",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful/decoy: API fleet scaled up while no real fix is applied.
  // Every added instance is another independent cache client capable of
  // detecting the same miss and issuing its own refresh for the SAME
  // popular keys — so origin QPS and concurrent refreshes get WORSE
  // than the unscaled baseline, even though the fleet itself has more
  // capacity to accept client requests. This is the scenario's binding
  // design requirement: raw capacity cannot fix synchronized per-
  // instance refresh racing.
  {
    id: "scaled-fleet-worsens-origin-load",
    when: {
      triggerEquals: { herdActive: true },
      controlAtLeast: { [API_INSTANCE_COUNT_KEY]: 24 },
      controlEquals: {
        [TTL_JITTER_ENABLED_KEY]: false,
        [SINGLE_FLIGHT_COALESCING_KEY]: false,
        [STALE_WHILE_REVALIDATE_ENABLED_KEY]: false,
      },
    },
    incidentState: "scaled-herd",
    values: {
      cacheMissRatePct: 90,
      concurrentRefreshes: 2_400,
      originQps: 9_600,
      originLatencyMs: 4_200,
      apiLatencyMs: 3_600,
      refreshFailureRatePct: 42,
      cacheHitRatioPct: 38,
      originStatus: "critical",
      revalidationMode: "unresolved",
    },
    componentHealth: originCriticalFleetHealthyHealth,
  },

  // ── Real but incomplete: refresh concurrency limit raised alone
  // (fleet size unchanged, no coalescing/jitter/SWR). Origin is now
  // allowed to accept more of the herd's duplicate refreshes
  // concurrently, so origin latency and failure rate improve somewhat
  // versus the unmitigated baseline — but the number of distinct
  // refreshers racing for the same keys never changed, so origin QPS
  // stays elevated near the baseline and the herd recurs at every
  // future synchronized expiry. A visible instance of masking the
  // symptom (how fast origin can drain duplicates) rather than removing
  // the duplicates themselves.
  {
    id: "concurrency-limit-masks-duplicate-refreshes",
    when: {
      triggerEquals: { herdActive: true },
      controlAtLeast: { [REFRESH_CONCURRENCY_LIMIT_KEY]: 400 },
      controlEquals: {
        [TTL_JITTER_ENABLED_KEY]: false,
        [SINGLE_FLIGHT_COALESCING_KEY]: false,
        [STALE_WHILE_REVALIDATE_ENABLED_KEY]: false,
      },
    },
    incidentState: "concurrency-masked",
    values: {
      cacheMissRatePct: 90,
      concurrentRefreshes: 400,
      originQps: 3_100,
      originLatencyMs: 1_100,
      apiLatencyMs: 950,
      refreshFailureRatePct: 8,
      cacheHitRatioPct: 55,
      originStatus: "warning",
      revalidationMode: "masked",
    },
    componentHealth: degradedHealth,
  },

  // ── Harmful: retry backoff shortened while nothing else is fixed.
  // Failed refreshes against the saturated origin retry almost
  // immediately, piling straight back onto origin and compounding the
  // exact load that caused them to fail — worse than the unmitigated
  // baseline on origin QPS and failure rate alike.
  {
    id: "short-backoff-amplifies-retries",
    when: {
      triggerEquals: { herdActive: true },
      controlAtMost: { [REFRESH_RETRY_BACKOFF_KEY]: 200 },
      controlEquals: {
        [TTL_JITTER_ENABLED_KEY]: false,
        [SINGLE_FLIGHT_COALESCING_KEY]: false,
        [STALE_WHILE_REVALIDATE_ENABLED_KEY]: false,
      },
    },
    incidentState: "retry-amplified",
    values: {
      cacheMissRatePct: 90,
      concurrentRefreshes: 760,
      originQps: 6_400,
      originLatencyMs: 3_100,
      apiLatencyMs: 2_700,
      refreshFailureRatePct: 58,
      cacheHitRatioPct: 44,
      originStatus: "critical",
      revalidationMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Second wave, baseline: sustained unmitigated herd load has
  // produced enough refresh failures that their retries are now
  // compounding on top of the original herd — reachable only once no
  // mitigation above has matched, and only after the already-visible
  // retryAmplifying precursor trigger.
  {
    id: "retry-amplification-baseline",
    when: { triggerEquals: { herdActive: true, retryAmplifying: true } },
    incidentState: "herd-retry-amplifying",
    values: {
      cacheMissRatePct: 90,
      concurrentRefreshes: 820,
      originQps: 7_200,
      originLatencyMs: 3_600,
      apiLatencyMs: 3_100,
      refreshFailureRatePct: 65,
      cacheHitRatioPct: 40,
      originStatus: "critical",
      revalidationMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: the shared TTL has been crossed and the
  // candidate has taken no meaningfully mitigating action yet. Every
  // API instance is independently refreshing the same expired keys.
  {
    id: "herd-baseline",
    when: { triggerEquals: { herdActive: true } },
    incidentState: "herding",
    values: {
      cacheMissRatePct: 88,
      concurrentRefreshes: 620,
      originQps: 5_400,
      originLatencyMs: 2_800,
      apiLatencyMs: 2_400,
      refreshFailureRatePct: 35,
      cacheHitRatioPct: 46,
      originStatus: "critical",
      revalidationMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Precursor window: expiry approaching, miss rate/concurrent
  // refreshes already visibly climbing ahead of the synchronized
  // instant, but the herd has not fully formed yet.
  {
    id: "expiry-approaching-baseline",
    when: { triggerEquals: { expiryApproaching: true } },
    incidentState: "expiry-approaching",
    values: {
      cacheMissRatePct: 18,
      concurrentRefreshes: 40,
      originQps: 420,
      originLatencyMs: 120,
      apiLatencyMs: 95,
      refreshFailureRatePct: 2,
      cacheHitRatioPct: 85,
      originStatus: "warning",
      revalidationMode: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      cacheMissRatePct: 2,
      concurrentRefreshes: 3,
      originQps: 80,
      originLatencyMs: 35,
      apiLatencyMs: 40,
      refreshFailureRatePct: 0,
      cacheHitRatioPct: 98,
      originStatus: "normal",
      revalidationMode: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
