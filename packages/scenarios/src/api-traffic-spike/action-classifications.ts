import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  CACHE_BEHAVIOR_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  DB_PROTECTION_MODE_KEY,
  NON_CRITICAL_ENDPOINT_ENABLED_KEY,
  RATE_LIMIT_MODE_KEY,
  REQUEST_QUEUE_MODE_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per phase6c.md section 14. Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: DB_PROTECTION_MODE_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "beneficial",
    feedback: {
      title: "Shielded the database from the cache-miss flood",
      explanation:
        "Switching the database into strict admission control meant slow or queued queries were shed quickly instead of piling up and holding connections indefinitely. This directly protected the connection pool — the resource that was actually constrained — regardless of what was happening to the cache.",
    },
  },
  {
    id: "acr_2",
    controlKey: CACHE_BEHAVIOR_KEY,
    valueEquals: "extendedTtl",
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "beneficial",
    feedback: {
      title: "Adapted cache behavior to the new traffic pattern",
      explanation:
        "Extending the cache TTL let the new, wider set of keys the spike was driving stay cached long enough to be reused. Hit rate recovered, which meant far fewer queries ever reached the database in the first place — a fix at the source of the fall-through load rather than a reaction to its symptoms.",
    },
  },
  {
    id: "acr_3",
    controlKey: API_INSTANCE_COUNT_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the layer that wasn't the bottleneck",
      explanation:
        "The cache hit rate was still collapsed under the new traffic pattern, so every request was effectively a database round trip. Adding API instances let more requests start concurrently, but each one still queued for the same exhausted connection pool — so database connection utilization and latency got worse, even though the API layer itself had more headroom to accept traffic.",
    },
  },
  {
    id: "acr_4",
    controlKey: DB_CONNECTION_POOL_SIZE_KEY,
    valueAtLeast: 100,
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "harmful",
    feedback: {
      title: "Widened the pipe into an overloaded database",
      explanation:
        "Raising the connection pool ceiling let more cache-miss queries run at once instead of queueing for a connection. That moved the bottleneck deeper into the database itself — CPU and lock pressure climbed further — rather than reducing the amount of traffic that reached it.",
    },
  },
  {
    id: "acr_5",
    controlKey: RATE_LIMIT_MODE_KEY,
    valueEquals: "on",
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "neutral",
    feedback: {
      title: "Protected the platform by throttling legitimate traffic",
      explanation:
        "Rate limiting cut load reaching every downstream component and the system stabilized, but this traffic was legitimate, non-malicious demand — real customer requests were being rejected for as long as the limit stayed in place. A defensible way to buy safety during the spike, but it trades away availability rather than fixing the cache/database bottleneck.",
    },
  },
  {
    id: "acr_6",
    controlKey: NON_CRITICAL_ENDPOINT_ENABLED_KEY,
    valueEquals: false,
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "neutral",
    feedback: {
      title: "Removed load by removing a feature",
      explanation:
        "Disabling the non-critical reporting endpoint stopped its load on both the cache and the database, and metrics recovered. But the feature itself was unavailable to customers for as long as it stayed off. This is a legitimate way to stabilize the platform under pressure, but it trades away functionality rather than fixing the underlying cache/database bottleneck.",
    },
  },
  {
    id: "acr_7",
    controlKey: REQUEST_QUEUE_MODE_KEY,
    valueEquals: "bounded",
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "neutral",
    feedback: {
      title: "Protected the API tier without touching the real constraint",
      explanation:
        "Bounding the request queue kept the API fleet itself from being overwhelmed by unbounded concurrency, which is a reasonable protective step. But every admitted request still fell through to the same cold cache and overloaded database, so connection pressure and latency downstream stayed elevated.",
    },
  },
];
