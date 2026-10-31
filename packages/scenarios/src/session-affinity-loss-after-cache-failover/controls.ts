import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance investigation*Done state keys, which the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts).
export const INSPECT_SESSION_ROUTING_KEY = "inspectSessionRouting";
export const INSPECT_AUTH_ERROR_LOGS_KEY = "inspectAuthErrorLogs";
export const INSPECT_CACHE_NODE_METRICS_KEY = "inspectCacheNodeMetrics";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The plausible-but-inferior path: the cache cluster's node failover
// made the cluster "look" resource-starved (CPU/memory climb on the
// surviving nodes as they absorb redistributed load), so scaling it up
// is the obvious first instinct. It does nothing for affinity, because
// affinity is a ROUTING/replication problem, not a capacity problem.
export const SCALE_CACHE_CLUSTER_KEY = "cacheClusterNodeCount";

// Also plausible but inferior: restarting the app server pool clears
// each app server's local in-memory routing-table cache, which
// temporarily "resets" a handful of affected connections — but the
// load balancer immediately re-derives the same stale hash ring from
// the still-unresynced session cache topology, so the mismatch comes
// right back as traffic resumes.
export const RESTART_APP_SERVERS_KEY = "restartAppServers";

// The real fix: re-derive the consistent-hash ring against the cache
// cluster's CURRENT topology (post-failover) and force a one-time
// session resync so every node holds a consistent view of every active
// session, instead of the stale pre-failover ring the load balancer
// kept routing against.
export const RESEED_HASH_RING_KEY = "reseedConsistentHashRing";
export const FORCE_SESSION_RESYNC_KEY = "forceSessionResync";

export const controls: ControlDefinition[] = [
  { key: INSPECT_SESSION_ROUTING_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_AUTH_ERROR_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_CACHE_NODE_METRICS_KEY, allowedValues: [false, true], initialValue: false },
  { key: SCALE_CACHE_CLUSTER_KEY, allowedValues: [3, 6, 9, 12], initialValue: 3 },
  { key: RESTART_APP_SERVERS_KEY, allowedValues: [false, true], initialValue: false },
  { key: RESEED_HASH_RING_KEY, allowedValues: [false, true], initialValue: false },
  { key: FORCE_SESSION_RESYNC_KEY, allowedValues: [false, true], initialValue: false },
];
