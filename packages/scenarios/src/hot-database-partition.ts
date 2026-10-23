import type { ScenarioDefinition } from "./types";
import {
  hotDatabasePartitionSimulation,
  PARTITIONING_STRATEGY_KEY,
  TENANT_THROTTLE_KEY,
  SHARD_SPLIT_INITIATED_KEY,
  ROUTING_POLICY_KEY,
  HOT_TENANT_CACHE_ENABLED_KEY,
  API_INSTANCE_COUNT_KEY,
} from "./hot-database-partition/definition";
import { hotDatabasePartitionCandidateUI } from "./hot-database-partition/candidate-ui";
import { HOT_DATABASE_PARTITION_SCORING } from "./hot-database-partition/scoring";

/**
 * Hot Database Partition — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 23). A small number of
 * high-volume tenants are hashing onto the same partition behind the
 * routing layer. The candidate must recognize that this is a key-design
 * problem, not a capacity problem, and must decide how to protect the
 * shared platform without simply offloading the cost onto one tenant,
 * one guarantee, or one neighboring partition.
 */
export const hotDatabasePartition: ScenarioDefinition = {
  id: "hot-database-partition",
  slug: "hot-database-partition",
  version: 1,
  name: "Hot Database Partition",
  description:
    "A handful of high-volume tenants are concentrating traffic on a single partition behind the routing layer, while the other three partitions sit nearly idle. Every tenant's data must remain available, and existing tenants' request throughput should not be throttled unless the alternative is broader platform instability. Diagnose why one partition is asymmetrically loaded and bring the platform back to a durable, equitable state.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  simulation: hotDatabasePartitionSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Sharding", "Partitioning", "Multi-Tenancy", "Routing", "Capacity"],
    skills: [
      "Diagnosing partition-key skew versus capacity shortage",
      "Recognizing when broad scaling cannot fix an asymmetric hot spot",
      "Evaluating structural re-keying against bounded tenant-level tradeoffs",
      "Anticipating how shard rebalancing can shift load onto a neighboring partition",
    ],
    shortDescription:
      "A handful of high-volume tenants are overloading one database partition while the rest of the cluster sits idle, and scaling broadly only makes it worse.",
  },
};

export {
  hotDatabasePartitionSimulation,
  hotDatabasePartitionCandidateUI,
  HOT_DATABASE_PARTITION_SCORING,
  PARTITIONING_STRATEGY_KEY,
  TENANT_THROTTLE_KEY,
  SHARD_SPLIT_INITIATED_KEY,
  ROUTING_POLICY_KEY,
  HOT_TENANT_CACHE_ENABLED_KEY,
  API_INSTANCE_COUNT_KEY,
};
