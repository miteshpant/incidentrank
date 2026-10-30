import type { ScenarioDefinition } from "./types";
import {
  searchPlatformCascadeSimulation,
  API_CAPACITY_KEY,
  CACHE_KEY,
  FEATURE_STORE_USAGE_KEY,
  INDEX_TIMEOUT_MS_KEY,
  PARTIAL_RESULT_MODE_KEY,
  QUERY_CONCURRENCY_KEY,
  RANKING_INCLUSION_KEY,
  RANKING_TIMEOUT_MS_KEY,
} from "./search-platform-cascade/definition";
import { searchPlatformCascadeCandidateUI } from "./search-platform-cascade/candidate-ui";
import { SEARCH_PLATFORM_CASCADE_SCORING } from "./search-platform-cascade/scoring";

/**
 * Search Platform Cascade — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6d.2.md, scenario 69). Ranking Service
 * latency has risen moderately — not failed outright. The Query
 * Coordinator now waits longer on every query for a ranking result,
 * holding its connections to Index Cluster A, Index Cluster B, and the
 * Feature Store open for the extended duration. This single moderate
 * slowdown in one internal dependency compounds through the Coordinator
 * into three distinct, simultaneously growing downstream pressure
 * points: Index Cluster A/B connection pressure, Feature Store QPS, and
 * Search API tail latency. Core search and index data remain healthy
 * throughout — nothing about the data itself is at risk.
 *
 * Business rules for this incident: basic search results are
 * business-critical and must remain available; advanced ranking and
 * re-ranking are optional during an incident and may be degraded or
 * disabled without that counting as a failure; search correctness must
 * never be sacrificed by returning stale or unrelated content outside
 * the allowed bound, even to make the system look fast or available;
 * and feature enrichment may be degraded. Decide how much of the
 * ranking/enrichment path to keep, how to protect Index Cluster A/B and
 * the Feature Store from the Coordinator's own held-connection pressure,
 * and how to bring ranking back — if at all — without re-triggering the
 * same pressure you just relieved.
 */
export const searchPlatformCascade: ScenarioDefinition = {
  id: "search-platform-cascade",
  slug: "search-platform-cascade",
  version: 1,
  name: "Search Platform Cascade",
  description:
    "Ranking Service latency has risen moderately — it has not failed outright. The Query Coordinator now waits longer on every query for a ranking result, holding its connections to Index Cluster A, Index Cluster B, and the Feature Store open for the extended duration. This single, moderately-degraded internal dependency compounds through the Coordinator into three distinct, simultaneously growing downstream pressure points: Index Cluster A/B connection pressure, Feature Store QPS, and Search API tail latency. Core search and index data remain healthy throughout. Business rules for this incident: basic search results are business-critical and must remain available; advanced ranking and re-ranking are optional during an incident — degrading or disabling them is an acceptable, legitimate response, not a failure; search correctness must never be sacrificed by returning stale or unrelated content outside the allowed bound, even to make the system look fast or available; and feature enrichment may be degraded. Decide how much of the ranking/enrichment path to keep, how to protect Index Cluster A/B and the Feature Store from the Coordinator's own held-connection pressure, and how — and whether — to bring ranking back without re-triggering the same pressure you just relieved.",
  difficulty: "senior_staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: searchPlatformCascadeSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Search", "Latency Cascade", "Degraded Mode", "Load Shedding", "Pressure Transfer"],
    skills: [
      "Distinguishing a business-critical path from an optional one under pressure",
      "Recognizing that a single moderately-degraded dependency can compound through a shared coordinator into multiple unrelated pressure points",
      "Rejecting the instinct to scale the edge tier when the root cause lives one hop downstream",
      "Accepting a legitimate, bounded degraded mode as a correct end state rather than a step toward full restoration",
      "Protecting correctness bounds even when availability metrics look healthy",
    ],
    shortDescription:
      "Ranking Service latency has risen moderately, and the Query Coordinator's held-open connections are compounding that into index-cluster, feature-store, and API-tail-latency pressure all at once.",
  },
};

export {
  searchPlatformCascadeSimulation,
  searchPlatformCascadeCandidateUI,
  SEARCH_PLATFORM_CASCADE_SCORING,
  API_CAPACITY_KEY,
  CACHE_KEY,
  FEATURE_STORE_USAGE_KEY,
  INDEX_TIMEOUT_MS_KEY,
  PARTIAL_RESULT_MODE_KEY,
  QUERY_CONCURRENCY_KEY,
  RANKING_INCLUSION_KEY,
  RANKING_TIMEOUT_MS_KEY,
};
