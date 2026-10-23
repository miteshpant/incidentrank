import type { ScenarioDefinition } from "./types";
import {
  missingDatabaseIndexSimulation,
  TARGETED_INDEX_ENABLED_KEY,
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
  QUERY_PAGE_SIZE_KEY,
  TEMPORARY_CACHE_ENABLED_KEY,
} from "./missing-database-index/definition";
import { missingDatabaseIndexCandidateUI } from "./missing-database-index/candidate-ui";
import { MISSING_DATABASE_INDEX_SCORING } from "./missing-database-index/scoring";

/**
 * Missing Database Index — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 21). A recently
 * deployed order-history query path has no supporting index. As traffic
 * to it rises, every lookup performs a full-table scan: scanned rows,
 * database CPU, and query latency climb together, connections get held
 * longer under load, and request queueing starts to appear at the API
 * layer. The candidate must recognize that database-side contention,
 * not API-layer capacity, is the actual constraint — scaling the API
 * tier only adds more concurrent scanners against the same primary and
 * makes it worse.
 */
export const missingDatabaseIndex: ScenarioDefinition = {
  id: "missing-database-index",
  slug: "missing-database-index",
  version: 1,
  name: "Missing Database Index",
  description:
    "A recently deployed order-history query path is performing full-table scans as traffic to it rises. Per-account order history must remain available to customers, and the Orders Service's connection pool is shared with other order-processing traffic — exhausting it risks degrading unrelated checkout paths too. Diagnose why database CPU and query latency are climbing together and bring the primary back to a durable, sustainable state.",
  difficulty: "intermediate",
  estimatedMinutes: 12,
  isFree: false,
  simulation: missingDatabaseIndexSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["PostgreSQL", "Indexing", "Query Performance", "Capacity", "Connection Pooling"],
    skills: [
      "Diagnosing full-table-scan query regressions",
      "Distinguishing database-side contention from API-layer capacity",
      "Recognizing when scaling the wrong tier makes contention worse",
      "Evaluating feature-sacrifice mitigations versus root-cause fixes",
    ],
    shortDescription:
      "A recently deployed query path is scanning the entire orders table as traffic climbs, and scaling the API layer alone only makes it worse.",
  },
};

export {
  missingDatabaseIndexSimulation,
  missingDatabaseIndexCandidateUI,
  MISSING_DATABASE_INDEX_SCORING,
  TARGETED_INDEX_ENABLED_KEY,
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
  QUERY_PAGE_SIZE_KEY,
  TEMPORARY_CACHE_ENABLED_KEY,
};
