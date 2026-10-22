import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BATCH_JOB_CHUNK_SIZE_KEY,
  BATCH_JOB_CONCURRENCY_KEY,
  LOCK_TIMEOUT_MS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: BATCH_JOB_CHUNK_SIZE_KEY,
    valueAtMost: 100,
    whenTriggerEquals: { batchJobRunning: true },
    outcome: "beneficial",
  },
  {
    controlKey: BATCH_JOB_CONCURRENCY_KEY,
    valueAtMost: 2,
    whenTriggerEquals: { batchJobRunning: true },
    outcome: "beneficial",
  },
  {
    controlKey: BATCH_JOB_CHUNK_SIZE_KEY,
    valueAtLeast: 50_000,
    whenTriggerEquals: { batchJobRunning: true },
    outcome: "harmful",
  },
  {
    controlKey: LOCK_TIMEOUT_MS_KEY,
    valueAtLeast: 300_000,
    whenTriggerEquals: { batchJobRunning: true },
    outcome: "neutral",
  },
];
