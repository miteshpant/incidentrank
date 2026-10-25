import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DATA_READ_COMPATIBILITY_MODE_KEY,
  GLOBAL_ROLLBACK_KEY,
  MIGRATION_REPAIR_KEY,
  REGION_ROLLOUT_APAC_KEY,
  REGION_ROLLOUT_EU_KEY,
  REGION_ROLLOUT_US_KEY,
  ROLLOUT_PAUSE_KEY,
  WRITE_COMPATIBILITY_MODE_KEY,
} from "./controls";

export const globalFeatureRolloutIncidentCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestSuccessRate", label: "Request Success Rate", sourceStateKey: "requestSuccessRate", format: "percentage" },
    { key: "euCorrectnessRate", label: "EU Correctness Rate", sourceStateKey: "euCorrectnessRate", format: "percentage" },
    { key: "usCorrectnessRate", label: "US Correctness Rate", sourceStateKey: "usCorrectnessRate", format: "percentage" },
    { key: "apacCorrectnessRate", label: "APAC Correctness Rate", sourceStateKey: "apacCorrectnessRate", format: "percentage" },
    { key: "alreadyIncompatibleWriteCount", label: "Already-Incompatible Writes (historical)", sourceStateKey: "alreadyIncompatibleWriteCount", format: "number" },
    { key: "repairedRecordCount", label: "Repaired Records", sourceStateKey: "repairedRecordCount", format: "number" },
    { key: "unreadableReadCount", label: "Unreadable Reads", sourceStateKey: "unreadableReadCount", format: "number" },
    { key: "storeCompatibilityStatus", label: "Store Compatibility Status", sourceStateKey: "storeCompatibilityStatus", format: "status" },
    { key: "rolloutStatus", label: "Rollout Status", sourceStateKey: "rolloutStatus", format: "status" },
  ],
  controls: [
    {
      key: REGION_ROLLOUT_EU_KEY,
      label: "EU Regional Rollout",
      componentId: "eu-service-fleet",
      valueLabels: { "rolled-out": "Rolled Out", halted: "Halted" },
    },
    {
      key: REGION_ROLLOUT_US_KEY,
      label: "US Regional Rollout",
      componentId: "us-service-fleet",
      valueLabels: { "rolled-out": "Rolled Out", halted: "Halted" },
    },
    {
      key: REGION_ROLLOUT_APAC_KEY,
      label: "APAC Regional Rollout",
      componentId: "apac-service-fleet",
      valueLabels: { "rolled-out": "Rolled Out", halted: "Halted" },
    },
    {
      key: WRITE_COMPATIBILITY_MODE_KEY,
      label: "Write Compatibility Mode",
      componentId: "shared-data-store",
      valueLabels: { "new-only": "New Representation Only", "dual-write": "Dual-Write (Old + New)" },
    },
    {
      key: GLOBAL_ROLLBACK_KEY,
      label: "Global Rollback",
      componentId: "feature-flag-platform",
      valueLabels: { false: "Active", true: "Rolled Back" },
    },
    {
      key: MIGRATION_REPAIR_KEY,
      label: "Migration Repair",
      componentId: "shared-data-store",
      valueLabels: { idle: "Idle", repairing: "Repairing" },
    },
    {
      key: DATA_READ_COMPATIBILITY_MODE_KEY,
      label: "Data Read Compatibility Mode",
      componentId: "shared-data-store",
      valueLabels: { strict: "Strict", "compatibility-shim": "Compatibility Shim" },
    },
    {
      key: ROLLOUT_PAUSE_KEY,
      label: "Rollout Pause",
      componentId: "feature-flag-platform",
      valueLabels: { false: "Not Paused", true: "Paused" },
    },
  ],
  components: [
    { id: "global-clients", label: "Global Clients" },
    { id: "traffic-router", label: "Traffic Router" },
    { id: "feature-flag-platform", label: "Feature Flag Platform" },
    { id: "us-service-fleet", label: "US Service Fleet" },
    { id: "eu-service-fleet", label: "EU Service Fleet" },
    { id: "apac-service-fleet", label: "APAC Service Fleet" },
    { id: "shared-data-store", label: "Shared Data Store" },
  ],
};
