import type { ScenarioDefinition } from "./types";
import {
  apiTrafficSpikeSimulation,
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  DB_PROTECTION_MODE_KEY,
  CACHE_BEHAVIOR_KEY,
  REQUEST_QUEUE_MODE_KEY,
  RATE_LIMIT_MODE_KEY,
  NON_CRITICAL_ENDPOINT_ENABLED_KEY,
} from "./api-traffic-spike/definition";
import { apiTrafficSpikeCandidateUI } from "./api-traffic-spike/candidate-ui";
import { API_TRAFFIC_SPIKE_SCORING } from "./api-traffic-spike/scoring";

/**
 * API Traffic Spike — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 43). A legitimate surge
 * in customer traffic shifts the request mix toward a wider, colder set
 * of cache keys than usual. As the cache hit rate falls, the volume of
 * queries falling through to the database rises, and the database
 * connection pool — not raw API CPU — becomes the actual constrained
 * resource. The candidate must recognize that the bottleneck is
 * downstream, not at the API tier: adding API instances alone just means
 * more concurrent requests reaching the same exhausted pool, worsening
 * database contention rather than relieving it.
 */
export const apiTrafficSpike: ScenarioDefinition = {
  id: "api-traffic-spike",
  slug: "api-traffic-spike",
  version: 1,
  name: "API Traffic Spike",
  description:
    "A legitimate, non-malicious surge in customer traffic is underway. Request volume has already roughly quintupled over its normal baseline, and the new traffic mix is hitting a wider, colder set of cache keys than the platform is used to serving. Core checkout and account flows depend on the database staying responsive, and the connection pool is shared across every customer-facing request path — if it saturates, everything downstream suffers together. A separate, non-critical reporting endpoint also shares this same database and cache. Diagnose what is actually running out of headroom as traffic climbs, and bring the platform back to a durable, sustainable state.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: apiTrafficSpikeSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Traffic Spike", "Caching", "Connection Pooling", "Rate Limiting", "Capacity"],
    skills: [
      "Distinguishing API-tier capacity from downstream database/cache constraints",
      "Reasoning about cache hit-rate collapse under a changed traffic pattern",
      "Recognizing when scaling the wrong tier makes contention worse",
      "Evaluating load-shedding tradeoffs (rate limiting, feature suppression) against root-cause fixes",
    ],
    shortDescription:
      "A legitimate traffic spike collapses the cache hit rate and saturates the database connection pool, and scaling the API fleet alone only makes it worse.",
  },
};

export {
  apiTrafficSpikeSimulation,
  apiTrafficSpikeCandidateUI,
  API_TRAFFIC_SPIKE_SCORING,
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  DB_PROTECTION_MODE_KEY,
  CACHE_BEHAVIOR_KEY,
  REQUEST_QUEUE_MODE_KEY,
  RATE_LIMIT_MODE_KEY,
  NON_CRITICAL_ENDPOINT_ENABLED_KEY,
};
