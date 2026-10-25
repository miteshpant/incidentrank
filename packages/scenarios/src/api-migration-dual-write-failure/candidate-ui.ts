import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  MIGRATION_DIRECTION_KEY,
  READ_SOURCE_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_PRIORITY_KEY,
  ROLLBACK_APPLICATION_TRAFFIC_KEY,
  ROLLOUT_PERCENT_KEY,
  SHADOW_TRAFFIC_KEY,
  WRITE_MODE_KEY,
} from "./controls";

export const apiMigrationDualWriteFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestSuccessRate", label: "Request Success Rate", sourceStateKey: "requestSuccessRate", format: "percentage" },
    { key: "unreconciledDivergentRecordCount", label: "Unreconciled Divergent Records", sourceStateKey: "unreconciledDivergentRecordCount", format: "number" },
    { key: "newOnlyUnreconciledRecordCount", label: "New-Only Unreconciled Records", sourceStateKey: "newOnlyUnreconciledRecordCount", format: "number" },
    { key: "exposedDivergentReadCount", label: "Exposed Divergent Reads", sourceStateKey: "exposedDivergentReadCount", format: "number" },
    { key: "silentlyLostAcknowledgedWriteCount", label: "Silently Lost Acknowledged Writes", sourceStateKey: "silentlyLostAcknowledgedWriteCount", format: "number" },
    { key: "blindReplayCorruptionCount", label: "Blind-Replay Corruption Count", sourceStateKey: "blindReplayCorruptionCount", format: "number" },
    { key: "newServiceWriteLatencyMs", label: "New Service Write Latency", sourceStateKey: "newServiceWriteLatencyMs", format: "duration" },
    { key: "reconciliationQueueDepth", label: "Reconciliation Queue Depth", sourceStateKey: "reconciliationQueueDepth", format: "number" },
    { key: "correctnessStatus", label: "Correctness Status", sourceStateKey: "correctnessStatus", format: "status" },
    { key: "authoritativeWriteSource", label: "Authoritative Write Source", sourceStateKey: "authoritativeWriteSource", format: "status" },
  ],
  controls: [
    {
      key: WRITE_MODE_KEY,
      label: "Write Mode",
      componentId: "migration-layer",
      valueLabels: { dual: "Dual-Write", "legacy-only": "Legacy Only", "new-only": "New Only" },
    },
    {
      key: READ_SOURCE_KEY,
      label: "Read Source",
      componentId: "migration-layer",
      valueLabels: { cohort: "By Rollout Cohort", legacy: "Legacy", new: "New" },
    },
    {
      key: ROLLOUT_PERCENT_KEY,
      label: "Rollout Percent",
      componentId: "migration-layer",
      valueLabels: { "0": "0%", "25": "25%", "50": "50%", "75": "75%", "100": "100%" },
    },
    {
      key: RECONCILIATION_MODE_KEY,
      label: "Reconciliation Mode",
      componentId: "reconciliation",
      valueLabels: { off: "Off", "replay-blind": "Blind Replay", "diff-and-repair": "Diff and Repair" },
    },
    {
      key: SHADOW_TRAFFIC_KEY,
      label: "Shadow Traffic to New",
      componentId: "new-service",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: ROLLBACK_APPLICATION_TRAFFIC_KEY,
      label: "Rollback Application Traffic",
      componentId: "api-gateway",
      valueLabels: { false: "Not Rolled Back", true: "Rolled Back" },
    },
    {
      key: REPAIR_PRIORITY_KEY,
      label: "Repair Priority",
      componentId: "reconciliation",
      valueLabels: { normal: "Normal", "critical-first": "Critical Path First" },
    },
    {
      key: MIGRATION_DIRECTION_KEY,
      label: "Migration Direction",
      componentId: "migration-layer",
      valueLabels: { undecided: "Undecided", "rollback-legacy": "Rollback to Legacy", "continue-new": "Continue to New" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "migration-layer", label: "Migration Layer" },
    { id: "legacy-service", label: "Legacy Service" },
    { id: "new-service", label: "New Service" },
    { id: "legacy-db", label: "Legacy DB" },
    { id: "new-db", label: "New DB" },
    { id: "reconciliation", label: "Reconciliation" },
  ],
};
