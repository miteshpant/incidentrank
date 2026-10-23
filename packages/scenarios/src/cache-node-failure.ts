import type { ScenarioDefinition } from "./types";
import {
  cacheNodeFailureSimulation,
  CACHE_NODE_COUNT_KEY,
  FAILOVER_MODE_KEY,
  DB_REQUEST_PROTECTION_KEY,
  CACHE_WARMING_MODE_KEY,
  APPLICATION_CONCURRENCY_KEY,
} from "./cache-node-failure/definition";
import { cacheNodeFailureCandidateUI } from "./cache-node-failure/candidate-ui";
import { CACHE_NODE_FAILURE_SCORING } from "./cache-node-failure/scoring";

/**
 * Cache Node Failure — a paid IncidentRank scenario (Phase 6B). One node
 * in a three-node distributed cache cluster fails. Its keys redistribute:
 * some concentrate onto the surviving nodes, others fall through as
 * outright misses that hit the primary database directly. The database
 * must stay within its normal read-latency range throughout — sustained
 * unprotected fallback-read pressure is the real risk here, not just a
 * lower cache hit rate. The candidate must restore cache capacity and/or
 * protect the database from the fallback-read spike, while recognizing
 * that aggressively refilling the cache can itself produce a second,
 * self-inflicted database spike.
 */
export const cacheNodeFailure: ScenarioDefinition = {
  id: "cache-node-failure",
  slug: "cache-node-failure",
  version: 1,
  name: "Cache Node Failure",
  description:
    "One node in the distributed cache cluster has failed. Its keys are redistributing — some concentrate onto the surviving nodes, others fall through as misses that hit the primary database directly. The database must stay within its normal read-latency range: sustained unprotected read pressure against it is treated as a critical incident, not just a cache-layer inconvenience. Restore the cache layer's effective capacity and protect the database from the fallback-read spike before it compounds.",
  difficulty: "intermediate",
  estimatedMinutes: 10,
  isFree: false,
  simulation: cacheNodeFailureSimulation,
  library: {
    category: "Caching",
    tags: ["Caching", "Database Protection", "Capacity", "Cache Warming", "Thundering Herd"],
    skills: [
      "Diagnosing cache-node loss and key redistribution",
      "Protecting a downstream database from fallback-read pressure",
      "Recognizing that aggressive cache warming can self-inflict a load spike",
      "Comparing capacity-restoration vs. database-side protection strategies",
    ],
    shortDescription:
      "A cache node fails and its keys redistribute, risking a database overload unless capacity or database protection is restored.",
  },
};

export {
  cacheNodeFailureSimulation,
  cacheNodeFailureCandidateUI,
  CACHE_NODE_FAILURE_SCORING,
  CACHE_NODE_COUNT_KEY,
  FAILOVER_MODE_KEY,
  DB_REQUEST_PROTECTION_KEY,
  CACHE_WARMING_MODE_KEY,
  APPLICATION_CONCURRENCY_KEY,
};
