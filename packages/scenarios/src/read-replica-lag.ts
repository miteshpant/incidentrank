import type { ScenarioDefinition } from "./types";
import {
  readReplicaLagSimulation,
  READ_ROUTING_MODE_KEY,
  REPLICATION_BATCH_SIZE_KEY,
  WRITE_THROTTLE_ENABLED_KEY,
} from "./read-replica-lag/definition";
import { readReplicaLagCandidateUI } from "./read-replica-lag/candidate-ui";
import { READ_REPLICA_LAG_SCORING } from "./read-replica-lag/scoring";

/**
 * Read Replica Lag — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A
 * write-heavy batch job on the primary database pushes asynchronous
 * replication to a read replica into a growing backlog, and reads served
 * from the lagging replica start returning stale data. The candidate
 * must recognize that routing only recently-written data's reads back to
 * the primary — not abandoning the replica entirely, and not simply
 * throttling writes — is the durable fix for consistency-sensitive
 * traffic during the lag spike.
 */
export const readReplicaLag: ScenarioDefinition = {
  id: "read-replica-lag",
  slug: "read-replica-lag",
  version: 1,
  name: "Read Replica Lag",
  description:
    "A write-heavy batch job on your primary database has pushed replication to your read replica into a growing backlog. Reads served from the replica are returning stale data, a reporting job is about to make it worse, and consumers that depend on strong consistency are starting to see incorrect results. Diagnose the lag and restore read consistency before it spreads further.",
  difficulty: "senior",
  estimatedMinutes: 14,
  isFree: false,
  simulation: readReplicaLagSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Replication", "Consistency", "Postgres", "Read Scaling", "Idempotency"],
    skills: [
      "Diagnosing replication lag and stale reads",
      "Read-your-writes routing strategies",
      "Consistency vs. read-scaling tradeoffs",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A write-heavy batch job pushes read replica lag into a critical backlog, serving stale data to consistency-sensitive consumers.",
  },
};

export {
  readReplicaLagSimulation,
  readReplicaLagCandidateUI,
  READ_REPLICA_LAG_SCORING,
  READ_ROUTING_MODE_KEY,
  REPLICATION_BATCH_SIZE_KEY,
  WRITE_THROTTLE_ENABLED_KEY,
};
