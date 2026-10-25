import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  FAILOVER_MODE_KEY,
  HEARTBEAT_INTERVAL_SECONDS_KEY,
  LEASE_DURATION_SECONDS_KEY,
  OWNERSHIP_FENCING_ENABLED_KEY,
  OWNERSHIP_RECONCILIATION_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

export const distributedCoordinationFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "ownershipConflictCount", label: "Ownership Conflicts", sourceStateKey: "ownershipConflictCount", format: "number" },
    { key: "missedWorkItemCount", label: "Missed Work Items", sourceStateKey: "missedWorkItemCount", format: "number" },
    { key: "stalledWorkerCount", label: "Stalled Workers", sourceStateKey: "stalledWorkerCount", format: "number" },
    { key: "staleLeaseCount", label: "Stale Leases", sourceStateKey: "staleLeaseCount", format: "number" },
    { key: "schedulerBacklogCount", label: "Scheduler Backlog", sourceStateKey: "schedulerBacklogCount", format: "number" },
    { key: "completedWorkPerMinute", label: "Completed Work / min", sourceStateKey: "completedWorkPerMinute", format: "number" },
    { key: "duplicateWorkCompletedCount", label: "Duplicate Work Completed", sourceStateKey: "duplicateWorkCompletedCount", format: "number" },
    { key: "coordinationServiceStatus", label: "Coordination Service Status", sourceStateKey: "coordinationServiceStatus", format: "status" },
  ],
  controls: [
    {
      key: HEARTBEAT_INTERVAL_SECONDS_KEY,
      label: "Heartbeat Interval",
      componentId: "workers",
    },
    {
      key: LEASE_DURATION_SECONDS_KEY,
      label: "Ownership Lease Duration",
      componentId: "coordination-service",
    },
    {
      key: OWNERSHIP_FENCING_ENABLED_KEY,
      label: "Ownership Fencing",
      componentId: "ownership-state",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: OWNERSHIP_RECONCILIATION_ENABLED_KEY,
      label: "Ownership Reconciliation",
      componentId: "coordination-service",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: WORKER_CONCURRENCY_KEY,
      label: "Worker Concurrency",
      componentId: "workers",
    },
    {
      key: FAILOVER_MODE_KEY,
      label: "Failover Mode",
      componentId: "coordination-service",
      valueLabels: { conservative: "Conservative", aggressive: "Aggressive" },
    },
  ],
  components: [
    { id: "workers", label: "Worker Fleet" },
    { id: "coordination-service", label: "Coordination Service" },
    { id: "ownership-state", label: "Shared Scheduling / Ownership State" },
  ],
};
