import type { ControlDefinition } from "@incidentrank/simulator";

/** How often Service C re-polls the Service Registry for its endpoint list, in seconds. A long interval means a stale registry snapshot keeps being reused long after the registry itself heals. */
export const DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY = "discoveryRefreshIntervalSeconds";

/** How long Service A keeps using an already-resolved endpoint list before asking discovery again, in seconds. Mirrors the refresh interval's staleness problem one layer up, at the caller. */
export const ENDPOINT_CACHE_TTL_SECONDS_KEY = "endpointCacheTtlSeconds";

/** Number of retry attempts Service A makes against Service C before giving up on a single call. */
export const RETRY_COUNT_KEY = "retryCount";

/** Whether Service A falls back to its own last-known-healthy endpoint list (bypassing a misbehaving registry snapshot) when a resolved endpoint repeatedly fails. */
export const FALLBACK_ROUTING_KEY = "fallbackRoutingEnabled";

/** How aggressively the registry evicts an endpoint that fails health checks. "passive" waits out a long grace period; "aggressive" evicts quickly, shrinking the healthy pool faster but stopping stale entries from being handed out as long. */
export const HEALTH_CHECK_POLICY_KEY = "healthCheckPolicy";

export const controls: ControlDefinition[] = [
  {
    key: DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
    allowedValues: [120, 30, 10, 5],
    initialValue: 120,
  },
  {
    key: ENDPOINT_CACHE_TTL_SECONDS_KEY,
    allowedValues: [300, 60, 15],
    initialValue: 300,
  },
  {
    key: RETRY_COUNT_KEY,
    allowedValues: [1, 3, 8, 20],
    initialValue: 3,
  },
  {
    key: FALLBACK_ROUTING_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: HEALTH_CHECK_POLICY_KEY,
    allowedValues: ["passive", "aggressive"],
    initialValue: "passive",
  },
];
