import type { ScenarioDefinition } from "./types";
import {
  primaryDatabaseFailoverSimulation,
  FAILOVER_INITIATED_KEY,
  PROMOTION_TIMING_KEY,
  OLD_PRIMARY_FENCING_KEY,
  CONNECTION_DRAIN_KEY,
  WRITE_ROUTING_POLICY_KEY,
  REPLICA_COUNT_KEY,
} from "./primary-database-failover/definition";
import { primaryDatabaseFailoverCandidateUI } from "./primary-database-failover/candidate-ui";
import { PRIMARY_DATABASE_FAILOVER_SCORING } from "./primary-database-failover/scoring";

/**
 * Primary Database Failover — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 24). The primary
 * database's health degrades and it eventually becomes fully
 * unavailable. The replica holds almost every write the primary has
 * accepted, but not quite all of them, and the DB Proxy does not
 * automatically prevent the old primary from accepting a write again
 * once it comes back into reach. The candidate must choose between
 * promoting the replica immediately to restore availability fast, or
 * waiting for replication lag to drain first — and, either way, must
 * decide whether and when to fence the old primary so it can never
 * accept a write again. A fast promotion that leaves the old primary
 * reachable and unfenced can look fully recovered at the availability
 * layer while both nodes remain able to accept writes at once.
 */
export const primaryDatabaseFailover: ScenarioDefinition = {
  id: "primary-database-failover",
  slug: "primary-database-failover",
  version: 1,
  name: "Primary Database Failover",
  difficulty: "staff",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  description:
    "The primary database's health is degrading and will become fully unavailable if nothing changes. Application services read and write through a DB Proxy sitting in front of a Primary and a Replica. Order and account data must remain correct above all else: a write that is silently lost, or a write accepted by a node that should no longer be authoritative, is a critical data-integrity incident, not a performance blip. Restore write availability to a durable, sustainable state.",
  simulation: primaryDatabaseFailoverSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["PostgreSQL", "Failover", "Replication", "High Availability", "Data Integrity"],
    skills: [
      "Reasoning about availability vs. correctness tradeoffs during failover",
      "Evaluating replication lag before promoting a replica",
      "Recognizing split-primary/concurrent-writer risk",
      "Deciding when fencing is required to make a cutover safe",
    ],
    shortDescription:
      "The primary database is failing and a replica must be promoted — but promoting it too aggressively risks stale writes or two nodes accepting writes at once.",
  },
};

export {
  primaryDatabaseFailoverSimulation,
  primaryDatabaseFailoverCandidateUI,
  PRIMARY_DATABASE_FAILOVER_SCORING,
  FAILOVER_INITIATED_KEY,
  PROMOTION_TIMING_KEY,
  OLD_PRIMARY_FENCING_KEY,
  CONNECTION_DRAIN_KEY,
  WRITE_ROUTING_POLICY_KEY,
  REPLICA_COUNT_KEY,
};
