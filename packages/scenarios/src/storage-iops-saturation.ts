import type { ScenarioDefinition } from "./types";
import {
  storageIopsSaturationSimulation,
  BACKGROUND_WORKLOAD_PAUSED_KEY,
  BATCH_CONCURRENCY_KEY,
  CHECKPOINT_FREQUENCY_SECONDS_KEY,
  STORAGE_TIER_KEY,
  QUERY_CONCURRENCY_LIMIT_KEY,
  READ_CACHE_ENABLED_KEY,
} from "./storage-iops-saturation/definition";
import { storageIopsSaturationCandidateUI } from "./storage-iops-saturation/candidate-ui";
import { STORAGE_IOPS_SATURATION_SCORING } from "./storage-iops-saturation/scoring";

/**
 * Storage IOPS Saturation — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 25). A nightly
 * background compaction job begins saturating the database's
 * persistent storage volume. Read/write latency, query latency, and
 * checkpoint queueing climb together, and API latency follows as the
 * database falls behind. Customer-facing order and account data must
 * stay available and fast; the compaction job itself has its own
 * scheduled completion window, so suppressing it indefinitely is not
 * free. The candidate must restore customer-facing health while
 * deciding how much of the background job's own progress to sacrifice
 * — and whether a durable, non-tradeoff fix exists instead.
 */
export const storageIopsSaturation: ScenarioDefinition = {
  id: "storage-iops-saturation",
  slug: "storage-iops-saturation",
  version: 1,
  name: "Storage IOPS Saturation",
  description:
    "A nightly background compaction job is saturating the database's persistent storage volume. Customer-facing order and account data must remain available and fast at all times — the Database tier is shared by every customer-facing read and write, so storage contention here degrades the whole platform, not just one feature. The background compaction job has its own scheduled completion window and is not itself customer-facing. Diagnose why storage IOPS, query latency, and checkpoint queueing are climbing together, and bring the system back to a durable, sustainable state.",
  difficulty: "senior",
  estimatedMinutes: 12,
  isFree: false,
  simulation: storageIopsSaturationSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Storage", "IOPS", "Capacity", "Checkpointing", "Batch Processing"],
    skills: [
      "Diagnosing storage-layer IOPS contention from a background workload",
      "Distinguishing a durable capacity fix from a workload-suppression tradeoff",
      "Reasoning about checkpoint-frequency and crash-recovery tradeoffs",
      "Prioritizing customer-facing health against non-critical background work",
    ],
    shortDescription:
      "A background compaction job is saturating storage IOPS, and the fastest customer-facing relief comes at the direct cost of the batch job's own progress.",
  },
};

export {
  storageIopsSaturationSimulation,
  storageIopsSaturationCandidateUI,
  STORAGE_IOPS_SATURATION_SCORING,
  BACKGROUND_WORKLOAD_PAUSED_KEY,
  BATCH_CONCURRENCY_KEY,
  CHECKPOINT_FREQUENCY_SECONDS_KEY,
  STORAGE_TIER_KEY,
  QUERY_CONCURRENCY_LIMIT_KEY,
  READ_CACHE_ENABLED_KEY,
};
