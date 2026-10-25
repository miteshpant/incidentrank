import type { ScenarioDefinition } from "./types";
import {
  crossRegionReplicationCostExplosionSimulation,
  ARCHIVE_REPLICATION_MODE_KEY,
  CRITICAL_DATA_PINNING_KEY,
  CRITICAL_REPLICATION_FACTOR_KEY,
  LOW_PRIORITY_REGION_FAN_OUT_KEY,
  LOW_PRIORITY_REPLICATION_FACTOR_KEY,
  STANDARD_REPLICATION_MODE_KEY,
  TRANSFER_BATCHING_KEY,
  TRANSFER_COMPRESSION_KEY,
} from "./cross-region-replication-cost-explosion/definition";
import { crossRegionReplicationCostExplosionCandidateUI } from "./cross-region-replication-cost-explosion/candidate-ui";
import { CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING } from "./cross-region-replication-cost-explosion/scoring";

/**
 * Cross-Region Replication Cost Explosion — a paid IncidentRank
 * scenario (docs/implementation_plan/phase6e2.md, scenario 87). A
 * replication-policy change widened cross-region fan-out and switched
 * every data class to synchronous replication. Freshness is excellent
 * everywhere and nothing is failing — but cross-region transfer,
 * replication fan-out, and storage-duplication cost have all risen
 * sharply and show no sign of coming back down on their own. The
 * candidate must reason about durability, per-class freshness
 * requirements, and egress/storage cost as a genuine policy-judgment
 * tradeoff: critical data must retain its mandated 3-region durability
 * floor, but not every class needs full active replication to every
 * region, and a cost optimization must never silently weaken the
 * disaster-recovery guarantee below policy.
 */
export const crossRegionReplicationCostExplosion: ScenarioDefinition = {
  id: "cross-region-replication-cost-explosion",
  slug: "cross-region-replication-cost-explosion",
  version: 1,
  name: "Cross-Region Replication Cost Explosion",
  description:
    "A replication-policy change applied last week widened cross-region fan-out and switched every data class — critical, standard, and low-priority alike — to synchronous replication across US, EU, and APAC. Freshness is excellent across every class and nothing is currently failing, but cross-region transfer cost, replication fan-out, and storage-duplication cost have all risen sharply and show no sign of coming back down on their own. Critical data (e.g. ledger/account-state records) must retain its mandated 3-region durability floor at all times — a cost optimization must never silently weaken this disaster-recovery guarantee below policy. Freshness requirements genuinely differ by dataset class, and not all data requires full active replication to every region: archived and low-priority data may use slower, narrower replication where explicitly allowed. Bring cost back to a sustainable level without ever breaching the durability floor the business depends on.",
  difficulty: "senior_staff",
  estimatedMinutes: 20,
  isFree: false,
  simulation: crossRegionReplicationCostExplosionSimulation,
  library: {
    category: "Infrastructure & Capacity",
    tags: ["Replication", "Cost Optimization", "Durability", "Disaster Recovery", "Multi-Region"],
    skills: [
      "Distinguishing durability-floor policy from freshness/latency requirements",
      "Reasoning about per-data-class replication scope, mode, and cost as independent levers",
      "Recognizing a cost optimization that looks safe right now but breaches a durability guarantee",
      "Evaluating two genuinely different cost-reduction mechanisms (scope narrowing vs. mode/batching) on their own merits",
    ],
    shortDescription:
      "A replication-policy change exploded cross-region cost while everything stays healthy — real savings exist, but one tempting lever quietly breaches a durability floor.",
  },
};

export {
  crossRegionReplicationCostExplosionSimulation,
  crossRegionReplicationCostExplosionCandidateUI,
  CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
  ARCHIVE_REPLICATION_MODE_KEY,
  CRITICAL_DATA_PINNING_KEY,
  CRITICAL_REPLICATION_FACTOR_KEY,
  LOW_PRIORITY_REGION_FAN_OUT_KEY,
  LOW_PRIORITY_REPLICATION_FACTOR_KEY,
  STANDARD_REPLICATION_MODE_KEY,
  TRANSFER_BATCHING_KEY,
  TRANSFER_COMPRESSION_KEY,
};
