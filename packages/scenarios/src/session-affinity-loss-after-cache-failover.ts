import type { ScenarioDefinition } from "./types";
import {
  sessionAffinityLossAfterCacheFailoverSimulation,
  INSPECT_SESSION_ROUTING_KEY,
  INSPECT_AUTH_ERROR_LOGS_KEY,
  INSPECT_CACHE_NODE_METRICS_KEY,
  SCALE_CACHE_CLUSTER_KEY,
  RESTART_APP_SERVERS_KEY,
  RESEED_HASH_RING_KEY,
  FORCE_SESSION_RESYNC_KEY,
} from "./session-affinity-loss-after-cache-failover/definition";
import { sessionAffinityLossAfterCacheFailoverCandidateUI } from "./session-affinity-loss-after-cache-failover/candidate-ui";
import { SESSION_AFFINITY_LOSS_AFTER_CACHE_FAILOVER_SCORING } from "./session-affinity-loss-after-cache-failover/scoring";

/**
 * Session Affinity Loss After Cache Node Failover — a paid IncidentRank
 * scenario (staff-level, Caching). A session cache node fails over.
 * Request latency and error rate barely move — the cache cluster itself
 * is never down and never slow. The real damage is a CORRECTNESS side
 * effect: the load balancer's consistent-hash ring still reflects the
 * pre-failover topology, so a subset of already-logged-in users' requests
 * route to a node that never received their session's replicated data.
 * Those users get bounced between inconsistent session states — treated
 * as logged out, or served a stale cart — even though every request
 * still gets a fast response. Cache node CPU/memory climb mildly as
 * surviving nodes absorb redistributed load (a misleading "scale it up"
 * signal unrelated to the actual fix). This is deliberately distinct
 * from a pure cache-node-AVAILABILITY incident (nothing here is slow or
 * erroring) and from a cross-region cache-consistency incident (this is
 * a single-cluster, within-region routing problem, not a replication-lag
 * problem across regions). The real fix has two parts: reseed the hash
 * ring against the cluster's current topology, and force a one-time
 * session resync so every node agrees on every active session.
 */
export const sessionAffinityLossAfterCacheFailover: ScenarioDefinition = {
  id: "session-affinity-loss-after-cache-failover",
  slug: "session-affinity-loss-after-cache-failover",
  version: 1,
  name: "Session Affinity Loss After Cache Node Failover",
  description:
    "A session cache node has failed over. Request latency and error rates look almost normal — the cache cluster isn't down and isn't slow. But a subset of logged-in users are being bounced between inconsistent session states: some see themselves abruptly logged out, others see a stale cart. The load balancer's consistent-hash ring is still routing against the pre-failover cache topology, sending some requests to a node that never received that session's replicated data. Diagnose the routing/replication mismatch and restore session consistency without just throwing capacity at a cluster that was never actually overloaded.",
  difficulty: "staff",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: sessionAffinityLossAfterCacheFailoverSimulation,
  library: {
    category: "Caching",
    tags: ["Caching", "Session Affinity", "Consistent Hashing", "Failover", "Correctness"],
    primarySkill: "Diagnosing a correctness side effect of cache failover, not just availability",
    skills: [
      "Distinguishing a routing/consistency problem from a capacity problem",
      "Reading session-specific correctness signals instead of generic latency/error metrics",
      "Recognizing that scaling a cluster doesn't fix a stale hash ring",
      "Understanding why reseeding a hash ring alone isn't enough without a session resync",
    ],
    shortDescription:
      "A cache node failover leaves the load balancer routing against a stale topology, silently bouncing logged-in users between inconsistent session states.",
  },
};

export {
  sessionAffinityLossAfterCacheFailoverSimulation,
  sessionAffinityLossAfterCacheFailoverCandidateUI,
  SESSION_AFFINITY_LOSS_AFTER_CACHE_FAILOVER_SCORING,
  INSPECT_SESSION_ROUTING_KEY,
  INSPECT_AUTH_ERROR_LOGS_KEY,
  INSPECT_CACHE_NODE_METRICS_KEY,
  SCALE_CACHE_CLUSTER_KEY,
  RESTART_APP_SERVERS_KEY,
  RESEED_HASH_RING_KEY,
  FORCE_SESSION_RESYNC_KEY,
};
