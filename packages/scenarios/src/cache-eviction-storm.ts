import type { ScenarioDefinition } from "./types";
import {
  cacheEvictionStormSimulation,
  CACHE_MEMORY_MULTIPLIER_KEY,
  CACHE_TTL_KEY,
  OBJECT_CACHING_POLICY_KEY,
  CACHE_ADMISSION_POLICY_KEY,
  API_CONCURRENCY_KEY,
  DB_PROTECTION_KEY,
} from "./cache-eviction-storm/definition";
import { cacheEvictionStormCandidateUI } from "./cache-eviction-storm/candidate-ui";
import { CACHE_EVICTION_STORM_SCORING } from "./cache-eviction-storm/scoring";

/**
 * Cache Eviction Storm — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 33). A recent
 * deployment changed the shape of what gets cached — objects got
 * noticeably bigger and there are now far more distinct cache keys in
 * play. The cache's provisioned memory has not changed, so entries are
 * now evicted before they are ever reused: eviction rate climbs, hit
 * ratio collapses, and the database behind the cache absorbs the
 * resulting read load. The candidate must recognize whether this is a
 * capacity shortfall or a mismatch between the caching/admission policy
 * and the new object shape/cardinality — and that provisioning more
 * memory alone only buys time at a larger scale rather than resolving
 * the churn.
 */
export const cacheEvictionStorm: ScenarioDefinition = {
  id: "cache-eviction-storm",
  slug: "cache-eviction-storm",
  version: 1,
  name: "Cache Eviction Storm",
  description:
    "A recent deployment changed what the cache is storing — cached objects got noticeably larger and the number of distinct cache keys in active use has grown substantially. Database read load must stay within its normal operating range: sustained unprotected read pressure against it is treated as a critical incident. Diagnose why eviction rate and hit ratio are moving together in the wrong direction, and bring the cache layer back to a durable, sustainable state rather than one that merely looks stable for now.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: cacheEvictionStormSimulation,
  library: {
    category: "Caching",
    tags: ["Caching", "Eviction Policy", "Capacity", "Cardinality", "Database Protection"],
    skills: [
      "Distinguishing a cache capacity shortfall from a caching-policy/cardinality mismatch",
      "Recognizing when added memory only delays the same churn at a larger scale",
      "Protecting a downstream database from cache-miss read pressure",
      "Evaluating object-shape and admission-policy changes as durable fixes",
    ],
    shortDescription:
      "A deployment changed cached object size and key cardinality, causing eviction churn that more memory alone cannot durably fix.",
  },
};

export {
  cacheEvictionStormSimulation,
  cacheEvictionStormCandidateUI,
  CACHE_EVICTION_STORM_SCORING,
  CACHE_MEMORY_MULTIPLIER_KEY,
  CACHE_TTL_KEY,
  OBJECT_CACHING_POLICY_KEY,
  CACHE_ADMISSION_POLICY_KEY,
  API_CONCURRENCY_KEY,
  DB_PROTECTION_KEY,
};
