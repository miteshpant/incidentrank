import type { ScenarioDefinition } from "./types";
import {
  connectionPoolStarvationSimulation,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_TRAFFIC_GRAPHS_KEY,
  INSPECT_POOL_CONFIG_KEY,
  RESTART_API_PODS_KEY,
  SCALE_API_REPLICAS_KEY,
  DB_POOL_MAX_SIZE_KEY,
} from "./connection-pool-starvation/definition";
import { connectionPoolStarvationCandidateUI } from "./connection-pool-starvation/candidate-ui";
import { CONNECTION_POOL_STARVATION_SCORING } from "./connection-pool-starvation/scoring";

/**
 * Connection Pool Starvation — a new deploy silently drops the database
 * connection pool's max-size default from 100 to 10. Traffic never
 * changes: this is a config regression exhausting the pool under
 * completely normal, steady-state load, not a demand-driven surge
 * (contrast database-connection-saturation, where a traffic spike is the
 * actual trigger). The candidate must notice that traffic is flat and
 * the primary database's own CPU looks fine — the pool's own utilization
 * and wait-queue depth are the only tell — and trace the regression back
 * to the deploy rather than reaching for traffic-driven remediations like
 * scaling out replicas.
 */
export const connectionPoolStarvation: ScenarioDefinition = {
  id: "connection-pool-starvation",
  slug: "connection-pool-starvation",
  version: 1,
  name: "Connection Pool Starvation",
  description:
    "A deploy just shipped. Request latency and error rates are climbing, and the database connection pool is pinned near 100% utilization — but traffic hasn't moved and the database's own CPU looks completely normal. Diagnose whether this is demand outgrowing capacity or something the deploy itself changed, and restore healthy throughput without just throwing more compute at the problem.",
  difficulty: "intermediate",
  estimatedMinutes: 12,
  isFree: false,
  structure: "linear",
  simulation: connectionPoolStarvationSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Postgres", "Connection Pooling", "Configuration Regression", "Deploys", "Capacity Planning"],
    primarySkill: "Distinguishing a config regression from demand-driven saturation",
    skills: [
      "Reading a flat traffic graph as evidence against a surge hypothesis",
      "Tracing a resource ceiling back to a recent deploy's config change",
      "Recognizing a plausible-but-inferior traffic-driven remediation",
      "Verifying recovery without overspending on unnecessary capacity",
    ],
    shortDescription:
      "A deploy quietly shrinks the DB connection pool's max size — normal traffic alone is enough to exhaust it.",
  },
};

export {
  connectionPoolStarvationSimulation,
  connectionPoolStarvationCandidateUI,
  CONNECTION_POOL_STARVATION_SCORING,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_TRAFFIC_GRAPHS_KEY,
  INSPECT_POOL_CONFIG_KEY,
  RESTART_API_PODS_KEY,
  SCALE_API_REPLICAS_KEY,
  DB_POOL_MAX_SIZE_KEY,
};
