import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  storageIopsUtilization: 22,
  storageReadLatencyMs: 4,
  storageWriteLatencyMs: 5,
  dbQueryLatencyMs: 18,
  checkpointQueueDepth: 2,
  apiLatencyMs: 45,
  batchThroughputRowsPerSec: 12_000,
  // Rises continuously whenever the background batch job is paused or
  // running at reduced concurrency instead of its normal throughput —
  // the candidate-visible evidence of the pressure-transfer tradeoff:
  // relieving storage IOPS by slowing the batch job has a real,
  // accumulating cost on the batch job's own completion time.
  batchBacklogMinutes: 0,
  storageStatus: "normal",
  // Generic string-state field (precedent: Kafka Partition Skew's
  // orderingMode, Missing Database Index's orderHistoryQueryHealth)
  // distinguishing WHY storage looks healthy: "tier-upgraded" means a
  // real capacity fix; "workload-paused"/"workload-throttled" means
  // relief was bought by suppressing the batch job's own progress;
  // "unresolved" means neither has happened yet. Read only by
  // successCondition/acceptableCondition/scoring, never by
  // scenario-specific scorer code.
  storageRecoveryMode: "unresolved",
  // Generic string-state field tracking the checkpoint-frequency
  // durability tradeoff: "standard" means the checkpoint interval is
  // still short enough to keep crash-recovery replay bounded;
  // "extended" means the candidate traded a longer recovery-replay
  // window for lower steady-state write IOPS.
  checkpointSafety: "standard",
};
