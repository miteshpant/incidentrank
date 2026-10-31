import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  FORCE_SESSION_RESYNC_KEY,
  INSPECT_AUTH_ERROR_LOGS_KEY,
  INSPECT_CACHE_NODE_METRICS_KEY,
  INSPECT_SESSION_ROUTING_KEY,
  RESEED_HASH_RING_KEY,
  RESTART_APP_SERVERS_KEY,
  SCALE_CACHE_CLUSTER_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_SESSION_ROUTING_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_AUTH_ERROR_LOGS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_CACHE_NODE_METRICS_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: RESEED_HASH_RING_KEY,
    valueEquals: true,
    whenTriggerEquals: { affinityBroken: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix (half 1): reseed the consistent-hash ring",
      explanation:
        "The load balancer was still routing against the pre-failover topology. Reseeding the hash ring against the cache cluster's current node set is what stops NEW requests from landing on the wrong node.",
    },
  },
  {
    controlKey: FORCE_SESSION_RESYNC_KEY,
    valueEquals: true,
    whenTriggerEquals: { affinityBroken: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix (half 2): force a session resync",
      explanation:
        "Reseeding the ring alone only protects future requests. Sessions that already split across the stale/new ring boundary stay inconsistent until they're explicitly resynced across every node.",
    },
  },
  {
    controlKey: SCALE_CACHE_CLUSTER_KEY,
    valueAtLeast: 6,
    whenTriggerEquals: { affinityBroken: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but mistaken: scaling the cache cluster",
      explanation:
        "CPU and memory on the surviving nodes did climb after the failover, but that's absorbed redistribution load, not the cause of the session problem. Adding nodes without reseeding the hash ring only gives the stale ring more nodes it doesn't know about.",
    },
  },
  {
    controlKey: RESTART_APP_SERVERS_KEY,
    valueEquals: true,
    whenTriggerEquals: { affinityBroken: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting the app server pool",
      explanation:
        "Restarting clears each app server's local routing-table cache for a moment, but the load balancer immediately re-derives the identical stale hash ring from the cache cluster's still-unresynced topology as soon as traffic resumes.",
    },
  },
];
