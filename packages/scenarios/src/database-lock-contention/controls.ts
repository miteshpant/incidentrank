import type { ControlDefinition } from "@incidentrank/simulator";

export const BATCH_JOB_CONCURRENCY_KEY = "batchJobConcurrency";
export const BATCH_JOB_CHUNK_SIZE_KEY = "batchJobChunkSize";
export const LOCK_TIMEOUT_MS_KEY = "lockTimeoutMs";

export const controls: ControlDefinition[] = [
  { key: BATCH_JOB_CONCURRENCY_KEY, allowedValues: [1, 2, 4, 8], initialValue: 4 },
  {
    key: BATCH_JOB_CHUNK_SIZE_KEY,
    allowedValues: [100, 1_000, 10_000, 50_000],
    initialValue: 10_000,
  },
  {
    key: LOCK_TIMEOUT_MS_KEY,
    allowedValues: [1_000, 5_000, 30_000, 300_000],
    initialValue: 5_000,
  },
];
