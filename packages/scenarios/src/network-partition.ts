import type { ScenarioDefinition } from "./types";
import {
  networkPartitionSimulation,
  LEDGER_AUTHORITATIVE_REGION_KEY,
  LEDGER_READ_MODE_KEY,
  LEDGER_WRITE_ROUTING_KEY,
  PROFILE_CONSISTENCY_MODE_KEY,
  REGION_A_ISOLATION_KEY,
  REGION_B_ISOLATION_KEY,
} from "./network-partition/definition";
import { networkPartitionCandidateUI } from "./network-partition/candidate-ui";
import { NETWORK_PARTITION_SCORING } from "./network-partition/scoring";

/**
 * Network Partition — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 53). Inter-region
 * replication between Region A and Region B has been severed. Each
 * region retains full local capacity and keeps serving traffic normally
 * on its own — nothing about either region's local health has changed.
 * The business has two explicit, different consistency requirements
 * depending on the kind of data being written: account-ledger data
 * (balances, financial transactions) must never be accepted by more than
 * one region at the same time, since a divergent ledger write is a
 * critical, unrecoverable correctness incident regardless of how healthy
 * write availability looks in either region individually; profile data
 * (display name, UI preferences, notification settings) has no such
 * requirement and may legitimately go temporarily stale, or become
 * briefly less available in one region, while the partition is active.
 * The candidate must decide how ledger writes get routed during the
 * partition, and separately, how much availability to trade for
 * freshness on profile data — two different data categories with two
 * different acceptable answers.
 */
export const networkPartition: ScenarioDefinition = {
  id: "network-partition",
  slug: "network-partition",
  version: 1,
  name: "Network Partition",
  description:
    "Inter-region replication between Region A and Region B has been severed, while each region keeps serving traffic normally with full local capacity. The business draws a hard line between two kinds of data: account-ledger writes (balances, financial transactions) must never be accepted by more than one region at the same time — a divergent ledger write during the partition is a critical, unrecoverable correctness incident no matter how healthy write availability looks in either region. Profile data (display name, UI preferences, notification settings) carries no such requirement and may legitimately tolerate temporary staleness, or reduced availability in one region, for the duration of the partition. Decide how ledger writes should be routed while the regions can't talk to each other, and separately decide how much availability you are willing to trade for freshness on profile data.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  simulation: networkPartitionSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Network Partition", "Consistency", "Write Routing", "Multi-Region", "CAP Tradeoffs"],
    skills: [
      "Recognizing when customer-facing availability conceals a correctness failure",
      "Encoding different consistency requirements for different data categories",
      "Distinguishing a structural write-routing fix from a manually-achieved safe state",
      "Reasoning about a genuine, bounded consistency-for-availability tradeoff",
    ],
    shortDescription:
      "Both regions keep serving traffic normally during a partition — but ledger writes and profile writes carry very different consistency requirements, and conflating them is the trap.",
  },
};

export {
  networkPartitionSimulation,
  networkPartitionCandidateUI,
  NETWORK_PARTITION_SCORING,
  LEDGER_AUTHORITATIVE_REGION_KEY,
  LEDGER_READ_MODE_KEY,
  LEDGER_WRITE_ROUTING_KEY,
  PROFILE_CONSISTENCY_MODE_KEY,
  REGION_A_ISOLATION_KEY,
  REGION_B_ISOLATION_KEY,
};
