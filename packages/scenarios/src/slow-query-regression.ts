import type { ScenarioDefinition } from "./types";
import {
  slowQueryRegressionSimulation,
  QUERY_TIMEOUT_MS_KEY,
  FORCE_INDEX_HINT_ENABLED_KEY,
  CONNECTION_POOL_SIZE_KEY,
} from "./slow-query-regression/definition";
import { slowQueryRegressionCandidateUI } from "./slow-query-regression/candidate-ui";
import { SLOW_QUERY_REGRESSION_SCORING } from "./slow-query-regression/scoring";

/**
 * Slow Query Regression — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A
 * recent deploy changed a query's shape (or a cardinality estimate went
 * stale after a data-growth event) and the query planner silently
 * stopped using the index it used to rely on — a previously-fast query
 * is now doing a full table scan under load. The candidate must diagnose
 * the plan regression and force the correct index, not simply throw more
 * connections or kill queries faster at the symptom.
 */
export const slowQueryRegression: ScenarioDefinition = {
  id: "slow-query-regression",
  slug: "slow-query-regression",
  version: 1,
  name: "Slow Query Regression",
  description:
    "A recent deploy changed the shape of a hot query, and the planner has stopped using the index it used to rely on. A previously fast endpoint is now doing a full table scan on every call — CPU utilization is climbing, queries are queuing, and latency is spiking. Diagnose the plan regression and restore the correct index usage before the database falls over under load.",
  difficulty: "senior",
  estimatedMinutes: 14,
  isFree: false,
  simulation: slowQueryRegressionSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Postgres", "Query Planning", "Indexing", "Performance", "Capacity Planning"],
    skills: [
      "Diagnosing query plan regressions",
      "Index hints and planner statistics",
      "CPU contention under load",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A deploy-induced query plan regression drops a hot query's index usage, pushing database CPU into a critical full-table-scan spiral.",
  },
};

export {
  slowQueryRegressionSimulation,
  slowQueryRegressionCandidateUI,
  SLOW_QUERY_REGRESSION_SCORING,
  QUERY_TIMEOUT_MS_KEY,
  FORCE_INDEX_HINT_ENABLED_KEY,
  CONNECTION_POOL_SIZE_KEY,
};
