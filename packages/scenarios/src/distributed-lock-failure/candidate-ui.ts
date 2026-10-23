import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
  FENCING_TOKEN_ENABLED_KEY,
  LEASE_DURATION_SECONDS_KEY,
  LEASE_RENEWAL_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

export const distributedLockFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "lockContentionRate", label: "Lock Contention Rate", sourceStateKey: "lockContentionRate", format: "number" },
    { key: "leaseExpiryDuringProcessingCount", label: "Lease Expiries During Processing", sourceStateKey: "leaseExpiryDuringProcessingCount", format: "number" },
    { key: "overlappingOwnerCount", label: "Overlapping Owner Count", sourceStateKey: "overlappingOwnerCount", format: "number" },
    { key: "duplicateWorkCount", label: "Duplicate Work Count", sourceStateKey: "duplicateWorkCount", format: "number" },
    { key: "correctnessViolationCount", label: "Correctness Violations", sourceStateKey: "correctnessViolationCount", format: "number" },
    { key: "processingDurationMs", label: "Processing Duration", sourceStateKey: "processingDurationMs", format: "duration" },
    { key: "resourceBlockedSeconds", label: "Resource Blocked", sourceStateKey: "resourceBlockedSeconds", format: "duration" },
    { key: "lockServiceStatus", label: "Lock Service Status", sourceStateKey: "lockServiceStatus", format: "status" },
  ],
  controls: [
    {
      key: LEASE_DURATION_SECONDS_KEY,
      label: "Lease Duration (seconds)",
      componentId: "lock-service",
    },
    {
      key: LEASE_RENEWAL_ENABLED_KEY,
      label: "Lease Renewal (Heartbeat)",
      componentId: "lock-service",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: FENCING_TOKEN_ENABLED_KEY,
      label: "Fencing Token",
      componentId: "shared-resource",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: WORKER_CONCURRENCY_KEY,
      label: "Worker Concurrency",
      componentId: "workers",
    },
    {
      key: ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
      label: "Retry Backoff on Lock-Acquire Failure",
      componentId: "workers",
      valueLabels: { false: "Off (tight retry)", true: "On (backoff)" },
    },
  ],
  components: [
    { id: "workers", label: "Worker Fleet" },
    { id: "lock-service", label: "Distributed Lock Service" },
    { id: "shared-resource", label: "Shared Resource" },
  ],
};
