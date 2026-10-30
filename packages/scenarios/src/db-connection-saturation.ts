import type { ScenarioDefinition } from "./types";
import {
  dbConnectionSaturationSimulation,
  POOL_SIZE_KEY,
  QUERY_TIMEOUT_MS_KEY,
  READ_REPLICA_ENABLED_KEY,
} from "./db-connection-saturation/definition";
import { dbConnectionSaturationCandidateUI } from "./db-connection-saturation/candidate-ui";
import { DB_CONNECTION_SATURATION_SCORING } from "./db-connection-saturation/scoring";

/**
 * Database Connection Saturation — a launch-quality IncidentRank
 * scenario (slug stable since its original Phase 5 engine-generalization
 * proof; promoted in place for Phase 6, never duplicated — see
 * docs/implementation_plan/phase6.md). A traffic spike exhausts the
 * primary database's connection pool while a competing background-jobs
 * workload makes an under-provisioned pool worse over time; the
 * candidate must balance pool capacity, query timeout, and read-replica
 * offload against cost.
 */
export const dbConnectionSaturation: ScenarioDefinition = {
  id: "database-connection-saturation",
  slug: "database-connection-saturation",
  version: 1,
  name: "Database Connection Saturation",
  description:
    "A sudden traffic spike is exhausting your primary database's connection pool. Requests are queuing, latency is climbing, and a scheduled batch job is about to make it worse. Diagnose the bottleneck and restore healthy throughput before the failure cascades.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: true,
  structure: "linear",
  simulation: dbConnectionSaturationSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Postgres", "Connection Pooling", "Replication", "Capacity Planning", "Backpressure"],
    skills: [
      "Diagnosing connection pool exhaustion",
      "Read/write workload separation",
      "Capacity vs. cost tradeoffs",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A traffic spike exhausts the database connection pool while a batch job competes for the same capacity.",
  },
};

export {
  dbConnectionSaturationSimulation,
  dbConnectionSaturationCandidateUI,
  DB_CONNECTION_SATURATION_SCORING,
  POOL_SIZE_KEY,
  QUERY_TIMEOUT_MS_KEY,
  READ_REPLICA_ENABLED_KEY,
};
