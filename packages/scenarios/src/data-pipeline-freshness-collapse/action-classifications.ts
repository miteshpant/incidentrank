import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BACKPRESSURE_KEY,
  BATCH_SIZE_KEY,
  CHECKPOINT_CADENCE_KEY,
  DATASET_PRIORITY_KEY,
  DROP_EVENTS_KEY,
  LOW_PRIORITY_INGESTION_THROTTLE_KEY,
  PROCESSOR_CONCURRENCY_KEY,
  WAREHOUSE_WRITER_CONCURRENCY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` explaining the system consequence, including
 * where pressure moved and any historical consequence created.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: PROCESSOR_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { processorLagging: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the Stream Processor without protecting the Warehouse",
      explanation:
        "Raising processor concurrency does increase processing throughput, but every additional worker also writes to the Warehouse. Without also raising warehouseWriterConcurrency AND relaxing checkpointCadence, the Warehouse's existing write path now receives more concurrent writers than it can safely absorb — warehouseWriteSuccessRate drops to 58% and write lock wait time climbs to 2,400ms, both measurably worse than doing nothing at all. Pressure that looked like pure processing throughput was transferred directly into Warehouse contention risk.",
    },
  },
  {
    id: "acr_2",
    controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { processorLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Raised Warehouse writer concurrency",
      explanation:
        "This increases how many concurrent writers the Warehouse can safely accept, which is necessary once the processor is scaled. On its own, with checkpoint cadence still frequent, contention is only partially relieved (warehouseWriteSuccessRate 82% vs. 58% unprotected) — checkpointCadence must also be relaxed for this to be fully effective, since frequent checkpoints still briefly serialize writers regardless of configured concurrency.",
    },
  },
  {
    id: "acr_3",
    controlKey: CHECKPOINT_CADENCE_KEY,
    valueEquals: "relaxed",
    whenTriggerEquals: { processorLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Relaxed Warehouse checkpoint cadence",
      explanation:
        "Checkpointing less often reduces how often in-flight writers are briefly serialized, which is the other half of what makes scaling the processor safe. Alone, with writer concurrency still at its default, this only partially relieves contention (warehouseWriteSuccessRate 85% vs. 58% unprotected) — both this and warehouseWriterConcurrency are independently required together.",
    },
  },
  {
    id: "acr_4",
    controlKey: DATASET_PRIORITY_KEY,
    valueEquals: "tier1-first",
    whenTriggerEquals: { processorLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Prioritized Tier-1 operational datasets",
      explanation:
        "Reordering processing so Tier-1 operational datasets drain ahead of Tier-2 analytical ones keeps tier1FreshnessSeconds inside its 120-second SLO even while the processor is still catching up, at the real cost of the Tier-2 backlog growing faster than it otherwise would. Without this, Tier-1 freshness itself breaches its SLO once the lag is sustained, even with the Warehouse fully protected — protecting the Warehouse alone is not sufficient.",
    },
  },
  {
    id: "acr_5",
    controlKey: LOW_PRIORITY_INGESTION_THROTTLE_KEY,
    valueEquals: true,
    whenTriggerEquals: { processorLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Throttled low-priority ingestion",
      explanation:
        "Throttling Tier-2 ingestion at the source measurably reduces how fast the Tier-2 backlog grows and accelerates how quickly it drains once the processor has caught up, without ever throttling or dropping a single Tier-1 event. Combined with safe processor scaling, the backlog at the same elapsed drain window is materially lower than without it.",
    },
  },
  {
    id: "acr_6",
    controlKey: BACKPRESSURE_KEY,
    valueEquals: true,
    whenTriggerEquals: { processorLagging: true },
    outcome: "neutral",
    feedback: {
      title: "Enabled Stream Processor backpressure",
      explanation:
        "Backpressure signals Ingestion to slow handoff once the processor's backlog crosses a real threshold, which bounds how much backlog accumulates inside the processor itself — but it does not increase processing throughput, so processorLagSeconds keeps climbing regardless. It never drops an event; it only moves where the backlog physically queues (further upstream, at Ingestion, rather than inside the processor).",
    },
  },
  {
    id: "acr_7",
    controlKey: BATCH_SIZE_KEY,
    valueEquals: "small",
    whenTriggerEquals: { processorLagging: true },
    outcome: "neutral",
    feedback: {
      title: "Reduced Warehouse batch size",
      explanation:
        "Smaller batches genuinely shorten each individual Warehouse write, measurably reducing lock wait time relative to doing nothing. But with processor concurrency still at normal, this does nothing for the actual processing-throughput shortfall — processorLagSeconds and the Tier-2 backlog continue climbing exactly as before.",
    },
  },
  {
    id: "acr_8",
    controlKey: DROP_EVENTS_KEY,
    valueEquals: true,
    whenTriggerEquals: { processorLagging: true },
    outcome: "harmful",
    feedback: {
      title: "Dropped events to improve lag metrics",
      explanation:
        "Enabling event dropping does make processorLagSeconds and the Tier-2 backlog read better almost immediately — but every discarded event increments droppedEventCount, a real, permanent correctness loss that never resets, regardless of how the lever is configured afterward. This directly violates the business invariant that events may not be dropped merely to make lag metrics look good, and it can never be classified acceptable or optimal once incurred, however healthy every other metric looks.",
    },
  },
];
