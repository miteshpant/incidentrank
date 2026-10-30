import type { ScenarioDefinition } from "./types";
import {
  cacheStampedeSimulation,
  CACHE_TTL_SECONDS_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  ORIGIN_CONNECTION_POOL_SIZE_KEY,
} from "./cache-stampede/definition";
import { cacheStampedeCandidateUI } from "./cache-stampede/candidate-ui";
import { CACHE_STAMPEDE_SCORING } from "./cache-stampede/scoring";

/**
 * Cache Stampede — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A
 * popular cache key expires under peak read traffic, and every request
 * that would have hit the cache instead misses at once, slamming the
 * origin database with a thundering herd of duplicate lookups. The
 * candidate must recognize that the durable fix is request coalescing
 * (collapsing duplicate in-flight lookups for the same key), not simply
 * throwing more origin capacity or a shorter TTL at the symptom.
 */
export const cacheStampede: ScenarioDefinition = {
  id: "cache-stampede",
  slug: "cache-stampede",
  version: 1,
  name: "Cache Stampede",
  description:
    "A popular cache key has expired under peak read traffic, and every request that would have hit the cache is now missing at once. The origin database is being hit with a thundering herd of duplicate lookups, latency is climbing, and the request queue is growing. Diagnose the stampede and stop it from recurring before the origin falls over.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: cacheStampedeSimulation,
  library: {
    category: "Caching",
    tags: ["Redis", "Concurrency", "Traffic Spike", "Thundering Herd", "TTL"],
    skills: [
      "Diagnosing cache stampedes and thundering herds",
      "Request coalescing and dog-piling prevention",
      "Cache TTL tradeoffs under load",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A popular cache key expires under peak load, sending a thundering herd of duplicate requests straight to the origin database.",
  },
};

export {
  cacheStampedeSimulation,
  cacheStampedeCandidateUI,
  CACHE_STAMPEDE_SCORING,
  CACHE_TTL_SECONDS_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  ORIGIN_CONNECTION_POOL_SIZE_KEY,
};
