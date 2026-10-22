import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BATCH_JOB_CHUNK_SIZE_KEY,
  BATCH_JOB_CONCURRENCY_KEY,
  LOCK_TIMEOUT_MS_KEY,
} from "./controls";

export const databaseLockContentionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "blockedTransactions", label: "Blocked Transactions", sourceStateKey: "blockedTransactions", format: "number" },
    { key: "queryLatencyP99Ms", label: "Query Latency P99", sourceStateKey: "queryLatencyP99Ms", format: "duration" },
    { key: "lockWaitTimeMs", label: "Lock Wait Time", sourceStateKey: "lockWaitTimeMs", format: "duration" },
    { key: "timedOutTransactions", label: "Timed Out Transactions", sourceStateKey: "timedOutTransactions", format: "number" },
    { key: "lockStatus", label: "Lock Status", sourceStateKey: "lockStatus", format: "status" },
  ],
  controls: [
    { key: BATCH_JOB_CONCURRENCY_KEY, label: "Batch Job Concurrency", componentId: "batch-job-worker" },
    {
      key: BATCH_JOB_CHUNK_SIZE_KEY,
      label: "Batch Chunk Size",
      componentId: "batch-job-worker",
      valueLabels: { "100": "100 rows", "1000": "1,000 rows", "10000": "10,000 rows", "50000": "50,000 rows" },
    },
    {
      key: LOCK_TIMEOUT_MS_KEY,
      label: "Lock Timeout",
      componentId: "primary-database",
      valueLabels: { "1000": "1s", "5000": "5s", "30000": "30s", "300000": "5m" },
    },
  ],
  components: [
    { id: "api-service", label: "API Service" },
    { id: "primary-database", label: "Primary Database" },
    { id: "batch-job-worker", label: "Batch Job Worker" },
    { id: "transaction-queue", label: "Transaction Queue" },
  ],
};
