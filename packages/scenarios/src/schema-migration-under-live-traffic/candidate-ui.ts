import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  APP_ROLLOUT_PERCENT_KEY,
  BACKFILL_CONCURRENCY_KEY,
  COMPATIBILITY_WRITE_MODE_KEY,
  DB_LOCK_TIMEOUT_MODE_KEY,
  MIGRATION_PHASE_KEY,
  RETRY_POLICY_KEY,
  ROLLBACK_APP_FLEET_KEY,
} from "./controls";

export const schemaMigrationUnderLiveTrafficCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestSuccessRate", label: "Request Success Rate", sourceStateKey: "requestSuccessRate", format: "percentage" },
    { key: "newShapeOnlyRowCount", label: "New-Shape-Only Rows", sourceStateKey: "newShapeOnlyRowCount", format: "number" },
    { key: "unreadableByServingFleetCount", label: "Reads Unreadable by Serving Fleet", sourceStateKey: "unreadableByServingFleetCount", format: "number" },
    { key: "discardedAcknowledgedWriteCount", label: "Discarded Acknowledged Writes", sourceStateKey: "discardedAcknowledgedWriteCount", format: "number" },
    { key: "dbLockWaitMs", label: "Shared DB Lock Wait", sourceStateKey: "dbLockWaitMs", format: "duration" },
    { key: "lockTimeoutFailureCount", label: "Lock Timeout Failures", sourceStateKey: "lockTimeoutFailureCount", format: "number" },
    { key: "backfillRepairedRowCount", label: "Backfill Repaired Rows", sourceStateKey: "backfillRepairedRowCount", format: "number" },
    { key: "compatibilityStatus", label: "Compatibility Status", sourceStateKey: "compatibilityStatus", format: "status" },
    { key: "servingFleetMode", label: "Serving Fleet Mode", sourceStateKey: "servingFleetMode", format: "status" },
  ],
  controls: [
    {
      key: APP_ROLLOUT_PERCENT_KEY,
      label: "App Rollout Percent (New Fleet)",
      componentId: "load-balancer",
      valueLabels: { "0": "0%", "25": "25%", "50": "50%", "75": "75%", "100": "100%" },
    },
    {
      key: COMPATIBILITY_WRITE_MODE_KEY,
      label: "Compatibility Write Mode",
      componentId: "shared-database",
      valueLabels: {
        "legacy-shape": "Legacy Shape Only",
        "dual-shape": "Dual Shape (Both Fields)",
        "new-shape-only": "New Shape Only",
      },
    },
    {
      key: MIGRATION_PHASE_KEY,
      label: "Migration Phase",
      componentId: "shared-database",
      valueLabels: { expand: "Expand", contract: "Contract" },
    },
    {
      key: BACKFILL_CONCURRENCY_KEY,
      label: "Backfill Concurrency",
      componentId: "backfill-workers",
      valueLabels: { off: "Off", low: "Low", high: "High" },
    },
    {
      key: DB_LOCK_TIMEOUT_MODE_KEY,
      label: "DB Lock Timeout Mode",
      componentId: "shared-database",
      valueLabels: { normal: "Normal", extended: "Extended" },
    },
    {
      key: ROLLBACK_APP_FLEET_KEY,
      label: "Rollback App Fleet",
      componentId: "load-balancer",
      valueLabels: { false: "Not Rolled Back", true: "Rolled Back to Old Fleet" },
    },
    {
      key: RETRY_POLICY_KEY,
      label: "Retry Policy",
      componentId: "clients",
      valueLabels: { normal: "Normal", aggressive: "Aggressive" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "old-app-fleet", label: "Old App Fleet" },
    { id: "new-app-fleet", label: "New App Fleet" },
    { id: "shared-database", label: "Shared Database" },
    { id: "backfill-workers", label: "Backfill / Migration Workers" },
  ],
};
