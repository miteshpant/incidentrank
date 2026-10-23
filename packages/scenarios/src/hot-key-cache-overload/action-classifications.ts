import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CACHE_CLUSTER_SIZE_KEY,
  CACHE_TTL_SECONDS_KEY,
  KEY_REPLICATION_ENABLED_KEY,
  LOCAL_API_CACHE_ENABLED_KEY,
  ORIGIN_PROTECTION_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  SHARDING_STRATEGY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every rule carries
 * `feedback` per Phase 6B's mandatory post-incident-feedback requirement
 * (docs/implementation_plan/phase6b.md section 13). Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: KEY_REPLICATION_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { hotKeySpike: true },
    outcome: "beneficial",
    feedback: {
      title: "Replicated the hot key across shards",
      explanation:
        "Replicating the hot key let its read traffic spread across multiple shards instead of concentrating on one. The hot shard's utilization and latency returned to baseline, and the recovery held regardless of how the rest of the cache cluster was configured — this fix targets the hot key itself, not the cache tier broadly.",
    },
  },
  {
    id: "acr_2",
    controlKey: REQUEST_COALESCING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { hotKeySpike: true },
    outcome: "beneficial",
    feedback: {
      title: "Collapsed concurrent requests into one origin fetch",
      explanation:
        "Coalescing concurrent requests for the hot key meant a traffic spike no longer multiplied origin load or shard re-insertion churn — every concurrent caller waited on a single in-flight fetch instead of each triggering its own. Origin traffic dropped sharply and hot-shard utilization recovered without needing to move the key or touch the cluster topology at all.",
    },
  },
  {
    id: "acr_3",
    controlKey: LOCAL_API_CACHE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { hotKeySpike: true },
    outcome: "beneficial",
    feedback: {
      title: "Served the hot key from the API tier directly",
      explanation:
        "Caching the hot key in-process at the API layer removed its traffic from the distributed cache entirely — it never reached a shard at all. This is a durable fix for this specific key's traffic pattern, independent of sharding strategy or cluster size.",
    },
  },
  {
    id: "acr_4",
    controlKey: SHARDING_STRATEGY_KEY,
    valueEquals: "roundRobin",
    whenTriggerEquals: { hotKeySpike: true },
    outcome: "neutral",
    feedback: {
      title: "Spread the load by giving up key locality",
      explanation:
        "Round-robin shard assignment also spread the hot key's traffic and cleared every symptom. But it abandons consistent per-key shard placement for every other key in the cluster, not just the hot one — a legitimate way to stabilize under pressure, but a different tradeoff than fixing the hot key's placement specifically.",
    },
  },
  {
    id: "acr_5",
    controlKey: CACHE_CLUSTER_SIZE_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { hotKeySpike: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled a tier that wasn't the bottleneck",
      explanation:
        "The hot key still hashed to the same single shard no matter how many additional shards existed in the cluster. Adding cache capacity broadly left the hot shard's own utilization and latency exactly as saturated as before — unrelated capacity cannot fix a single key concentrating traffic on one shard.",
    },
  },
  {
    id: "acr_6",
    controlKey: ORIGIN_PROTECTION_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { hotKeySpike: true },
    outcome: "neutral",
    feedback: {
      title: "Shielded the origin, not the hot shard",
      explanation:
        "Rate-limiting traffic to the origin service genuinely protected it from the cache-miss stampede, and origin request rate dropped. But the hot shard itself — the actual constraint — was untouched and stayed fully saturated. This protects a downstream tier from a symptom without addressing where the load was actually concentrating.",
    },
  },
  {
    id: "acr_7",
    controlKey: CACHE_TTL_SECONDS_KEY,
    valueAtMost: 5,
    whenTriggerEquals: { hotKeySpike: true },
    outcome: "harmful",
    feedback: {
      title: "Shortened the TTL on an already-hot key",
      explanation:
        "A shorter TTL makes the hot key expire and re-fetch far more often. Each re-fetch both re-hits the origin and re-inserts into the same already-saturated shard, so shortening the TTL during the spike increased churn and made the hot shard's load worse rather than better.",
    },
  },
  {
    id: "acr_8",
    controlKey: CACHE_TTL_SECONDS_KEY,
    valueAtLeast: 90,
    whenTriggerEquals: { hotKeySpike: true },
    outcome: "neutral",
    feedback: {
      title: "Reduced churn without addressing the concentration",
      explanation:
        "Keeping the TTL long reduced how often the hot key had to be re-fetched, giving some relief to both origin and shard churn. But the shard was still serving the full hit volume for that one key at full request rate — the underlying concentration on a single shard remained.",
    },
  },
];
