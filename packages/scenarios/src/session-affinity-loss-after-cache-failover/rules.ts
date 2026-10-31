import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  FORCE_SESSION_RESYNC_KEY,
  INSPECT_AUTH_ERROR_LOGS_KEY,
  INSPECT_CACHE_NODE_METRICS_KEY,
  INSPECT_SESSION_ROUTING_KEY,
  RESEED_HASH_RING_KEY,
  RESTART_APP_SERVERS_KEY,
  SCALE_CACHE_CLUSTER_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "load-balancer": "healthy",
  "app-server-pool": "healthy",
  "session-cache": "healthy",
  "auth-service": "healthy",
};

const brokenHealth: Record<string, ComponentHealth> = {
  "load-balancer": "healthy",
  "app-server-pool": "degraded",
  "session-cache": "critical",
  "auth-service": "degraded",
};

const partiallyRelievedHealth: Record<string, ComponentHealth> = {
  "load-balancer": "healthy",
  "app-server-pool": "degraded",
  "session-cache": "degraded",
  "auth-service": "degraded",
};

/**
 * Authored rule table for the Session Affinity Loss After Cache Node
 * Failover scenario. This is a LINEAR structure, by design: there is
 * exactly one real root cause (the load balancer's consistent-hash ring
 * went stale against the cache cluster's post-failover topology, so a
 * subset of requests for already-logged-in users route to a node that
 * never received their session's replicated data) and exactly one real
 * fix (reseed the hash ring against current topology AND force a
 * one-time session resync so every node agrees on every active
 * session). Unlike a pure cache-node-AVAILABILITY incident, request
 * latency and error rate barely move here — the cache cluster itself is
 * never down and never slow. The actual damage is CORRECTNESS: a
 * fraction of logged-in users get bounced between inconsistent session
 * states (treated by their own browser as "logged out," or served a
 * stale cart) even though every request still gets a fast 200 response.
 * This is also deliberately distinct from a cross-region cache-
 * consistency scenario — there is only one region and one cluster here;
 * the inconsistency is purely a within-cluster ROUTING problem (the
 * hash ring), not a cross-region replication-lag problem.
 *
 * `cacheNodeCpuPercent`/`cacheNodeMemoryPercent` climb mildly on the
 * surviving nodes as they absorb redistributed key ownership — this is
 * real but is NOT the cause of the session problem, and is the intended
 * misleading "scale it up" signal (see SCALE_CACHE_CLUSTER_KEY in
 * controls.ts). Restarting the app server pool is the second plausible-
 * but-inferior path: it clears local routing-table caches, briefly
 * masking the symptom for the servers that restarted, but the load
 * balancer immediately re-derives the identical stale ring on the next
 * request, so the mismatch returns.
 *
 * `diagnosisPath` captures what the candidate actually did by
 * completion — read generically by scoring.ts's finalStringEquals
 * measure, and by the post-incident narrative via roleInIncident-tagged
 * metrics (candidate-ui.ts) — never a bespoke mechanism.
 */
export const sessionAffinityRules: Rule[] = [
  // ── Best path: investigated routing, auth logs, and cache node
  // metrics, THEN applied both halves of the real fix (reseed the hash
  // ring and force a session resync).
  {
    id: "correlated-then-fixed",
    when: {
      triggerEquals: { affinityBroken: true },
      controlEquals: {
        [INSPECT_SESSION_ROUTING_KEY]: true,
        [INSPECT_AUTH_ERROR_LOGS_KEY]: true,
        [INSPECT_CACHE_NODE_METRICS_KEY]: true,
        [RESEED_HASH_RING_KEY]: true,
        [FORCE_SESSION_RESYNC_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      requestLatencyMs: 75,
      requestErrorRatePercent: 0.2,
      sessionAffinityMismatchRatePercent: 1,
      sessionStateInconsistencyRatePercent: 0.4,
      unexpectedLogoutRatePercent: 0.3,
      cacheNodeCpuPercent: 24,
      cacheNodeMemoryPercent: 31,
      authServiceErrorRatePercent: 0.2,
      diagnosisPath: "correlated-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without investigating the correlation first
  // (both halves of the fix were applied, but without demonstrating WHY
  // via the investigation toggles). The outage still resolves — the fix
  // is the fix — but the candidate never showed they understood the
  // mechanism, which is exactly what the investigation-quality scoring
  // dimension penalizes.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { affinityBroken: true },
      controlEquals: {
        [RESEED_HASH_RING_KEY]: true,
        [FORCE_SESSION_RESYNC_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      requestLatencyMs: 75,
      requestErrorRatePercent: 0.2,
      sessionAffinityMismatchRatePercent: 1,
      sessionStateInconsistencyRatePercent: 0.4,
      unexpectedLogoutRatePercent: 0.3,
      cacheNodeCpuPercent: 24,
      cacheNodeMemoryPercent: 31,
      authServiceErrorRatePercent: 0.2,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial fix: reseeded the hash ring (so NEW requests route
  // consistently going forward) but never forced a resync, so sessions
  // already split across the stale/new ring boundary stay inconsistent
  // until they naturally expire. Meaningfully better than doing nothing,
  // but not a full recovery.
  {
    id: "reseeded-without-resync",
    when: {
      triggerEquals: { affinityBroken: true },
      controlEquals: { [RESEED_HASH_RING_KEY]: true, [FORCE_SESSION_RESYNC_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      requestLatencyMs: 75,
      requestErrorRatePercent: 0.2,
      sessionAffinityMismatchRatePercent: 3,
      sessionStateInconsistencyRatePercent: 9,
      unexpectedLogoutRatePercent: 7,
      cacheNodeCpuPercent: 25,
      cacheNodeMemoryPercent: 32,
      authServiceErrorRatePercent: 1,
      diagnosisPath: "reseeded-without-resync",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Inferior path A: scaled the cache cluster up. CPU/memory on the
  // surviving nodes were climbing, so this looks like the right call —
  // but affinity is a routing/replication problem, not a capacity one.
  // Adding nodes without reseeding the ring actually makes the hash
  // ring MORE stale (now there are even more nodes the ring doesn't
  // know about), so the mismatch rate gets slightly worse, not better.
  {
    id: "scaled-cache-cluster-only",
    when: {
      triggerEquals: { affinityBroken: true },
      controlAtLeast: { [SCALE_CACHE_CLUSTER_KEY]: 6 },
      controlEquals: { [RESEED_HASH_RING_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      requestLatencyMs: 72,
      requestErrorRatePercent: 0.2,
      sessionAffinityMismatchRatePercent: 24,
      sessionStateInconsistencyRatePercent: 21,
      unexpectedLogoutRatePercent: 16,
      cacheNodeCpuPercent: 14,
      cacheNodeMemoryPercent: 19,
      authServiceErrorRatePercent: 3,
      diagnosisPath: "scaled-cache-cluster-only",
    },
    componentHealth: brokenHealth,
  },

  // ── Inferior path B: restarted the app server pool only. Clears each
  // server's local routing-table cache for a moment, but the load
  // balancer re-derives the same stale ring from the still-unresynced
  // cache topology as soon as traffic resumes, so the mismatch relapses.
  {
    id: "restarted-app-servers-only",
    when: {
      triggerEquals: { affinityBroken: true },
      controlEquals: { [RESTART_APP_SERVERS_KEY]: true, [RESEED_HASH_RING_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      requestLatencyMs: 80,
      requestErrorRatePercent: 0.3,
      sessionAffinityMismatchRatePercent: 19,
      sessionStateInconsistencyRatePercent: 17,
      unexpectedLogoutRatePercent: 14,
      cacheNodeCpuPercent: 23,
      cacheNodeMemoryPercent: 31,
      authServiceErrorRatePercent: 3,
      diagnosisPath: "restarted-app-servers-only",
    },
    componentHealth: brokenHealth,
  },

  // ── Baseline critical: failover happened, no mitigation applied yet.
  // Request latency/error rate are deliberately almost unaffected — the
  // "service is up" signal is NOT the cause the candidate needs to
  // notice. The real tell is session-specific: affinity mismatch,
  // inconsistent session state, and unexpected logouts.
  {
    id: "failover-baseline",
    when: { triggerEquals: { affinityBroken: true } },
    incidentState: "broken",
    values: {
      requestLatencyMs: 78,
      requestErrorRatePercent: 0.3,
      sessionAffinityMismatchRatePercent: 27,
      sessionStateInconsistencyRatePercent: 23,
      unexpectedLogoutRatePercent: 18,
      cacheNodeCpuPercent: 24,
      cacheNodeMemoryPercent: 32,
      authServiceErrorRatePercent: 4,
      diagnosisPath: "not-attempted",
    },
    componentHealth: brokenHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestLatencyMs: 70,
      requestErrorRatePercent: 0.2,
      sessionAffinityMismatchRatePercent: 1,
      sessionStateInconsistencyRatePercent: 0.5,
      unexpectedLogoutRatePercent: 0.3,
      cacheNodeCpuPercent: 22,
      cacheNodeMemoryPercent: 30,
      authServiceErrorRatePercent: 0.2,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
