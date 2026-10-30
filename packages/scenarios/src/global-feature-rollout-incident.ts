import type { ScenarioDefinition } from "./types";
import {
  DATA_READ_COMPATIBILITY_MODE_KEY,
  GLOBAL_ROLLBACK_KEY,
  globalFeatureRolloutIncidentSimulation,
  MIGRATION_REPAIR_KEY,
  REGION_ROLLOUT_APAC_KEY,
  REGION_ROLLOUT_EU_KEY,
  REGION_ROLLOUT_US_KEY,
  ROLLOUT_PAUSE_KEY,
  WRITE_COMPATIBILITY_MODE_KEY,
} from "./global-feature-rollout-incident/definition";
import { globalFeatureRolloutIncidentCandidateUI } from "./global-feature-rollout-incident/candidate-ui";
import { GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING } from "./global-feature-rollout-incident/scoring";

/**
 * Global Feature Rollout Incident — a paid, Principal-level IncidentRank
 * scenario (docs/implementation_plan/phase6d.4.md, scenario 78). A
 * global feature rollout has introduced a region-dependent correctness
 * problem: the US, EU, and APAC Service Fleets can each independently
 * diverge in how they interpret the new feature, and writes made under
 * the new, incompatible representation accumulate in one Shared Data
 * Store — a real multi-region correctness divergence, not a single-
 * service deployment regression or a database-schema-shape problem
 * within one application fleet.
 */
export const globalFeatureRolloutIncident: ScenarioDefinition = {
  id: "global-feature-rollout-incident",
  slug: "global-feature-rollout-incident",
  version: 1,
  name: "Global Feature Rollout Incident",
  description:
    "A global feature rollout has introduced a region-dependent correctness problem: the US, EU, and APAC Service Fleets can each independently diverge in how they interpret the new feature, and the rollout is writing customer records in a new, possibly-incompatible representation into one Shared Data Store. Five business invariants govern every decision here: (1) correctly-written existing customer state must remain readable after rollback — rollback is never automatically a repair; (2) a regional rollout may be halted independently of the others — a single region's decision never requires touching every region; (3) global rollback may not discard or hide already-written incompatible data — the historical count of incompatible writes must remain visible and must not be silently zeroed; (4) the Shared Data Store must not be left holding mutually incompatible active representations without an explicit compatibility strategy (dual-write, migration repair, or a read-time compatibility shim); (5) correctness outranks rollout velocity — a faster rollout is never worth a wider, unrepaired correctness gap. Decide which regions to halt or continue, whether to roll the feature back globally or fix forward with dual-write, how to resolve the already-written incompatible backlog (migration repair vs. a read-compatibility shim), and in what order — rolling back before repairing leaves a real, measurable gap that rolling back alone does not close.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  structure: "linear",
  simulation: globalFeatureRolloutIncidentSimulation,
  library: {
    category: "Deployments & Reliability",
    tags: [
      "Feature Rollout",
      "Multi-Region",
      "Data Compatibility",
      "Historical Damage",
      "Sequencing",
      "Correctness",
    ],
    skills: [
      "Distinguishing a rollback from a repair of already-written data",
      "Recognizing region-dependent correctness divergence vs. a uniform availability outage",
      "Choosing between forward-fix (dual-write), rollback+repair, and rollback+compatibility-shim",
      "Sequencing growth-stop before repair to avoid racing a moving target",
    ],
    shortDescription:
      "A global feature rollout diverges by region and writes incompatible records into a shared data store — rollback stops new damage but never repairs what was already written.",
  },
};

export {
  globalFeatureRolloutIncidentSimulation,
  globalFeatureRolloutIncidentCandidateUI,
  GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
  DATA_READ_COMPATIBILITY_MODE_KEY,
  GLOBAL_ROLLBACK_KEY,
  MIGRATION_REPAIR_KEY,
  REGION_ROLLOUT_APAC_KEY,
  REGION_ROLLOUT_EU_KEY,
  REGION_ROLLOUT_US_KEY,
  ROLLOUT_PAUSE_KEY,
  WRITE_COMPATIBILITY_MODE_KEY,
};
