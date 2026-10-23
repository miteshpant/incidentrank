import type { ScenarioDefinition } from "./types";
import {
  hotKeyCacheOverloadSimulation,
  KEY_REPLICATION_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  LOCAL_API_CACHE_ENABLED_KEY,
  CACHE_TTL_SECONDS_KEY,
  CACHE_CLUSTER_SIZE_KEY,
  ORIGIN_PROTECTION_ENABLED_KEY,
  SHARDING_STRATEGY_KEY,
} from "./hot-key-cache-overload/definition";
import { hotKeyCacheOverloadCandidateUI } from "./hot-key-cache-overload/candidate-ui";
import { HOT_KEY_CACHE_OVERLOAD_SCORING } from "./hot-key-cache-overload/scoring";

/**
 * Hot-Key Cache Overload — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 32). A single
 * extremely popular key begins receiving a surge of traffic. Because
 * the distributed cache hashes that key to one specific shard, that
 * shard's request rate, utilization, and latency climb sharply while
 * the rest of the cache cluster stays completely flat. The candidate
 * must recognize that the problem is concentrated on one key's
 * placement, not the cache tier's overall capacity — adding shards or
 * nodes to the cluster does nothing for the one shard the hot key
 * already hashes to.
 */
export const hotKeyCacheOverload: ScenarioDefinition = {
  id: "hot-key-cache-overload",
  slug: "hot-key-cache-overload",
  version: 1,
  name: "Hot-Key Cache Overload",
  description:
    "A single extremely popular cache key is receiving a sudden surge of read traffic. The distributed cache hashes that key to one specific shard, and that shard's request rate, utilization, and latency are climbing sharply while the rest of the cluster stays flat. The origin service behind the cache has limited headroom and must not be overwhelmed by repeated fetches for the same key. Diagnose why this one shard is saturated while its neighbors sit idle, and bring it back to a durable, sustainable state.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  simulation: hotKeyCacheOverloadSimulation,
  library: {
    category: "Caching",
    tags: ["Caching", "Hot Key", "Sharding", "Request Coalescing", "Capacity"],
    skills: [
      "Diagnosing single-key cache hotspots versus cluster-wide capacity problems",
      "Distinguishing a targeted fix from a cluster-wide capacity increase",
      "Evaluating request coalescing and local caching as origin-protection strategies",
      "Recognizing when a mitigation clears symptoms by sacrificing a different guarantee",
    ],
    shortDescription:
      "One popular key is overloading a single cache shard while the rest of the cluster stays idle, and adding more cache capacity elsewhere does not help.",
  },
};

export {
  hotKeyCacheOverloadSimulation,
  hotKeyCacheOverloadCandidateUI,
  HOT_KEY_CACHE_OVERLOAD_SCORING,
  KEY_REPLICATION_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  LOCAL_API_CACHE_ENABLED_KEY,
  CACHE_TTL_SECONDS_KEY,
  CACHE_CLUSTER_SIZE_KEY,
  ORIGIN_PROTECTION_ENABLED_KEY,
  SHARDING_STRATEGY_KEY,
};
