import type { ScenarioDefinition } from "./types";
import {
  dataPipelineFreshnessCollapseSimulation,
  BACKPRESSURE_KEY,
  BATCH_SIZE_KEY,
  CHECKPOINT_CADENCE_KEY,
  DATASET_PRIORITY_KEY,
  DROP_EVENTS_KEY,
  LOW_PRIORITY_INGESTION_THROTTLE_KEY,
  PROCESSOR_CONCURRENCY_KEY,
  WAREHOUSE_WRITER_CONCURRENCY_KEY,
} from "./data-pipeline-freshness-collapse/definition";
import { dataPipelineFreshnessCollapseCandidateUI } from "./data-pipeline-freshness-collapse/candidate-ui";
import { DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING } from "./data-pipeline-freshness-collapse/scoring";

/**
 * Data Pipeline Freshness Collapse — a paid, Senior-Staff-level
 * IncidentRank scenario (docs/implementation_plan/phase6d3.md, scenario
 * 75). Ingestion stays healthy while the Stream Processor falls behind
 * real-time. Scaling processor concurrency alone, without protecting the
 * Warehouse write path, transfers pressure downstream into Warehouse
 * lock contention. Different datasets carry different business-critical
 * freshness requirements, so the candidate must make a tiered judgment,
 * not merely throw capacity at the first bottleneck they see.
 */
export const dataPipelineFreshnessCollapse: ScenarioDefinition = {
  id: "data-pipeline-freshness-collapse",
  slug: "data-pipeline-freshness-collapse",
  version: 1,
  name: "Data Pipeline Freshness Collapse",
  description:
    "The Stream Processor sitting between Ingestion and the Warehouse has begun falling behind real-time. Source Systems and Ingestion success both stay healthy throughout — this is not an ingestion outage, and the dashboard that only watches ingestion will never show anything wrong. Five business invariants govern every decision here: (1) Tier-1 operational datasets must remain within their authored 120-second freshness SLO at all times, even while the incident is active; (2) lower-priority Tier-2 analytical datasets may lag substantially during the incident — there is no freshness SLO on them, and protecting them is never a reason to risk Tier-1 or the Warehouse; (3) events may never be dropped merely to make lag metrics look better — discarding events to improve a dashboard is a permanent, irreversible correctness violation, not a shortcut, and it is tracked as a historical count that never resets once incurred; (4) Warehouse correctness and durability must be preserved — scaling the Stream Processor's concurrency without also protecting the Warehouse's write path (writer concurrency and checkpoint cadence) floods the Warehouse with more concurrent writers than it can safely absorb, which is the single most tempting and most harmful response to this incident; (5) a backlog is an acceptable way to hand this incident back only if it is bounded and demonstrably draining, never if it is frozen or still growing. Decide how to safely increase processing throughput without breaking the Warehouse, how to protect Tier-1 freshness without starving the processor entirely, and how much real elapsed drain time a given backlog genuinely needs before the incident can be called resolved.",
  difficulty: "senior_staff",
  estimatedMinutes: 25,
  isFree: false,
  structure: "linear",
  simulation: dataPipelineFreshnessCollapseSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "Stream Processing",
      "Data Freshness",
      "Tiered SLOs",
      "Pressure Transfer",
      "Historical Damage",
      "Backlog Drain",
    ],
    skills: [
      "Distinguishing a healthy ingestion path from a processing-tier bottleneck",
      "Recognizing that naively scaling a bottleneck can transfer pressure downstream",
      "Making tiered freshness-SLO tradeoffs across datasets of different business priority",
      "Avoiding event dropping as a correctness-destroying shortcut",
      "Modeling a bounded, draining backlog instead of a frozen or discarded one",
    ],
    shortDescription:
      "Stream processing falls behind while ingestion stays healthy, and the obvious fix — scaling the processor — floods the Warehouse with write contention unless it's protected first.",
  },
};

export {
  dataPipelineFreshnessCollapseSimulation,
  dataPipelineFreshnessCollapseCandidateUI,
  DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING,
  BACKPRESSURE_KEY,
  BATCH_SIZE_KEY,
  CHECKPOINT_CADENCE_KEY,
  DATASET_PRIORITY_KEY,
  DROP_EVENTS_KEY,
  LOW_PRIORITY_INGESTION_THROTTLE_KEY,
  PROCESSOR_CONCURRENCY_KEY,
  WAREHOUSE_WRITER_CONCURRENCY_KEY,
};
