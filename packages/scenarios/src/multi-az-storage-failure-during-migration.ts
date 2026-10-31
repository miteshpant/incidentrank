import type { ScenarioDefinition } from "./types";
import {
  multiAzStorageFailureDuringMigrationSimulation,
  INSPECT_AZ_A_VOLUME_HEALTH_KEY,
  INSPECT_MIGRATION_RETRY_LOGS_KEY,
  INSPECT_AZ_C_SATURATION_KEY,
  PAUSE_MIGRATION_KEY,
  MIGRATION_RETRY_BACKOFF_KEY,
  RESTART_AZ_A_VOLUMES_KEY,
  FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
} from "./multi-az-storage-failure-during-migration/definition";
import { multiAzStorageFailureDuringMigrationCandidateUI } from "./multi-az-storage-failure-during-migration/candidate-ui";
import { MULTI_AZ_STORAGE_FAILURE_DURING_MIGRATION_SCORING } from "./multi-az-storage-failure-during-migration/scoring";

/**
 * Multi-AZ Storage Failure During Live Migration — a paid, Staff-level,
 * cascading-structure IncidentRank scenario. Midway through a live
 * storage-tier migration (AZ-A as the source, AZ-B as the target),
 * AZ-A's volumes degrade with elevated I/O errors. That alone is not
 * the outage: the migration controller's own retry logic, re-attempting
 * every failed AZ-A copy operation, begins re-targeting AZ-C — the one
 * AZ that was still fully healthy and already carrying live production
 * traffic. The retry amplification cascades extra load onto AZ-C,
 * saturating its connection pool and degrading customer-facing latency
 * and error rates through the shared Storage Router.
 *
 * This is a compound failure during an ACTIVE migration — a cascading
 * AZ-to-AZ load-transfer topology not used elsewhere in the catalog:
 * distinct from a single-shot primary-database failover (there is no
 * single primary here) and distinct from a schema-migration-under-
 * live-traffic correctness incident (there is no data-divergence
 * invariant at stake — the failure mode is pure cascading overload).
 * The candidate must stop the cascade at its source (the migration
 * controller's retry storm) and relieve customer impact with a
 * controlled, not total, failover of live traffic to AZ-C — restarting
 * AZ-A's degraded volumes does nothing (it's a hardware/infra
 * degradation, not a process crash), and dumping 100% of live traffic
 * onto AZ-C without first stopping the retry storm actively accelerates
 * the exact cascade already underway.
 */
export const multiAzStorageFailureDuringMigration: ScenarioDefinition = {
  id: "multi-az-storage-failure-during-migration",
  slug: "multi-az-storage-failure-during-migration",
  version: 1,
  name: "Multi-AZ Storage Failure During Live Migration",
  description:
    "Midway through a live storage-tier migration, Availability Zone A's volumes start throwing I/O errors. That alone wouldn't take anything down — but the migration controller's own retry logic keeps re-attempting the failed copy operations against AZ-C, the one zone that was still fully healthy and already serving live production traffic. AZ-C's connection pool starts saturating, and customer-facing latency and error rates climb through the shared storage router. Stop the cascade at its source and get live traffic safely off the degraded zone — without accelerating the very overload you're trying to relieve.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "cascading",
  simulation: multiAzStorageFailureDuringMigrationSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Multi-AZ", "Storage Migration", "Cascading Failure", "Retry Storms", "Capacity"],
    primarySkill: "Stopping a self-inflicted cascade before chasing its downstream symptom",
    skills: [
      "Recognizing a retry loop amplifying one failure into a second, distinct failure",
      "Distinguishing a hardware/infra degradation from a process that a restart can fix",
      "Sequencing remediation so a failover relieves load instead of doubling it",
      "Verifying recovery across both the source failure and its cascaded effect",
    ],
    shortDescription:
      "AZ-A's volumes degrade mid-migration, and the migration controller's own retries cascade the overload onto the one AZ that was still healthy.",
  },
};

export {
  multiAzStorageFailureDuringMigrationSimulation,
  multiAzStorageFailureDuringMigrationCandidateUI,
  MULTI_AZ_STORAGE_FAILURE_DURING_MIGRATION_SCORING,
  INSPECT_AZ_A_VOLUME_HEALTH_KEY,
  INSPECT_MIGRATION_RETRY_LOGS_KEY,
  INSPECT_AZ_C_SATURATION_KEY,
  PAUSE_MIGRATION_KEY,
  MIGRATION_RETRY_BACKOFF_KEY,
  RESTART_AZ_A_VOLUMES_KEY,
  FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
};
