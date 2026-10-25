import type { ScenarioDefinition } from "./types";
import {
  hotShardReplicaLagFailoverRiskSimulation,
  API_CONCURRENCY_KEY,
  FAILOVER_SHARD2_KEY,
  HOT_TENANT_THROTTLE_KEY,
  READ_ROUTING_KEY,
  RECONCILE_STRANDED_WRITES_KEY,
  REPLICA_CATCHUP_PRIORITY_KEY,
  WRITE_THROTTLE_SHARD2_KEY,
} from "./hot-shard-replica-lag-failover-risk/definition";
import { hotShardReplicaLagFailoverRiskCandidateUI } from "./hot-shard-replica-lag-failover-risk/candidate-ui";
import { HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING } from "./hot-shard-replica-lag-failover-risk/scoring";

/**
 * Hot Shard + Replica Lag + Failover Risk -- a paid, Principal-level
 * IncidentRank scenario (docs/implementation_plan/phase6d.2.md,
 * scenario 67). A concentrated high-volume tenant has begun driving a
 * disproportionate share of traffic onto Shard 2 specifically (Shards
 * 1, 3, and 4 remain unaffected). As Shard 2 Primary's write pressure
 * climbs, its replica independently falls behind the write stream --
 * and the replica's own process-health check keeps reporting fully
 * healthy the entire time, because process health only reflects
 * whether the replica process is up and responding, never whether its
 * replicated data is caught up enough to be trusted with write
 * authority. API-level customer latency rises as Shard 2's queueing
 * backs up through the Shard Router.
 *
 * Four business invariants govern every decision here: (1)
 * acknowledged writes must not be lost -- a write the system has
 * already confirmed to a client may never simply vanish; (2) temporary
 * throttling of one tenant is acceptable to protect the platform --
 * the concentrated hot tenant's own throughput may be sacrificed to
 * protect every other tenant and the shared infrastructure; (3) stale
 * reads may be tolerated only within the authored bound -- routing
 * reads to a replica whose lag exceeds that bound is itself a
 * violation, independent of any failover decision; (4) a replica
 * cannot become authoritative until it is sufficiently caught up --
 * promoting a lagging replica risks exactly the acknowledged-write
 * loss invariant (1) forbids, regardless of how healthy the replica's
 * process health reads at the moment of promotion.
 */
export const hotShardReplicaLagFailoverRisk: ScenarioDefinition = {
  id: "hot-shard-replica-lag-failover-risk",
  slug: "hot-shard-replica-lag-failover-risk",
  version: 1,
  name: "Hot Shard + Replica Lag + Failover Risk",
  description:
    "A concentrated high-volume tenant has begun driving a disproportionate share of traffic onto Shard 2 specifically -- Shards 1, 3, and 4 remain unaffected. Shard 2 Primary's request rate, write latency, and queue depth are climbing. Independently but as a direct consequence of the same write pressure, Shard 2's replica has begun falling behind the primary's write stream -- and the replica's own process-health check keeps reporting fully healthy the entire time, because process health reflects only whether the replica process is up and responding, never whether its replicated data is caught up enough to safely take write authority. API-level customer latency is rising as Shard 2's queueing backs up through the shared Shard Router. Four business invariants govern every decision here: (1) acknowledged writes must not be lost -- a write the system has already confirmed to a client may never simply vanish; (2) temporary throttling of one tenant is acceptable to protect the platform -- the concentrated hot tenant's own throughput may be sacrificed to protect every other tenant and the shared infrastructure; (3) stale reads may be tolerated only within the authored bound -- routing reads to a replica whose lag exceeds that bound is itself a violation, independent of any failover decision; (4) a replica cannot become authoritative until it is sufficiently caught up -- promoting a lagging replica risks exactly the acknowledged-write loss invariant (1) forbids, regardless of how healthy the replica's process health reads at the moment of promotion. Decide how to relieve Shard 2's hot-tenant pressure, how to protect replica catch-up, whether and when a failover is actually safe, and how to route reads and restore traffic once the shard is stable.",
  difficulty: "principal",
  estimatedMinutes: 22,
  isFree: false,
  simulation: hotShardReplicaLagFailoverRiskSimulation,
  library: {
    category: "Distributed Systems",
    tags: [
      "Sharding",
      "Replication Lag",
      "Failover Risk",
      "Data Integrity",
      "Pressure Transfer",
      "Historical Damage",
    ],
    skills: [
      "Distinguishing process health from replication-position safety",
      "Recognizing when a mitigation adds connections without relieving the actual bottleneck",
      "Sequencing containment before failover rather than failing over first",
      "Modeling historical correctness damage separately from live configuration",
    ],
    shortDescription:
      "A hot shard and its lagging replica interact with a tempting failover decision -- promoting too early strands acknowledged writes that reconciliation alone cannot undo instantly.",
  },
};

export {
  hotShardReplicaLagFailoverRiskSimulation,
  hotShardReplicaLagFailoverRiskCandidateUI,
  HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
  API_CONCURRENCY_KEY,
  FAILOVER_SHARD2_KEY,
  HOT_TENANT_THROTTLE_KEY,
  READ_ROUTING_KEY,
  RECONCILE_STRANDED_WRITES_KEY,
  REPLICA_CATCHUP_PRIORITY_KEY,
  WRITE_THROTTLE_SHARD2_KEY,
};
