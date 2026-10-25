import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  ARCHIVE_REPLICATION_MODE_KEY,
  CRITICAL_DATA_PINNING_KEY,
  CRITICAL_REPLICATION_FACTOR_KEY,
  LOW_PRIORITY_REGION_FAN_OUT_KEY,
  LOW_PRIORITY_REPLICATION_FACTOR_KEY,
  STANDARD_REPLICATION_MODE_KEY,
  TRANSFER_BATCHING_KEY,
  TRANSFER_COMPRESSION_KEY,
} from "./controls";

export const crossRegionReplicationCostExplosionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "monthlyCrossRegionTransferCostUsd", label: "Cross-Region Transfer Cost", sourceStateKey: "monthlyCrossRegionTransferCostUsd", format: "currency" },
    { key: "monthlyStorageDuplicationCostUsd", label: "Storage Duplication Cost", sourceStateKey: "monthlyStorageDuplicationCostUsd", format: "currency" },
    { key: "monthlyTotalReplicationCostUsd", label: "Total Replication Cost", sourceStateKey: "monthlyTotalReplicationCostUsd", format: "currency" },
    { key: "criticalFreshnessSeconds", label: "Critical Data Freshness", sourceStateKey: "criticalFreshnessSeconds", format: "duration" },
    { key: "standardFreshnessSeconds", label: "Standard Data Freshness", sourceStateKey: "standardFreshnessSeconds", format: "duration" },
    { key: "lowPriorityFreshnessSeconds", label: "Low-Priority Data Freshness", sourceStateKey: "lowPriorityFreshnessSeconds", format: "duration" },
    { key: "criticalDataDurabilityStatus", label: "Critical Data Durability", sourceStateKey: "criticalDataDurabilityStatus", format: "status" },
    { key: "replicationScopeStatus", label: "Replication Scope", sourceStateKey: "replicationScopeStatus", format: "status" },
    { key: "archiveDurabilityStatus", label: "Archive Durability", sourceStateKey: "archiveDurabilityStatus", format: "status" },
    { key: "drDrillStatus", label: "DR Drill Status", sourceStateKey: "drDrillStatus", format: "status" },
    { key: "criticalDataExposureEventCount", label: "Critical Data Exposure Events (Historical)", sourceStateKey: "criticalDataExposureEventCount", format: "number" },
  ],
  controls: [
    {
      key: CRITICAL_REPLICATION_FACTOR_KEY,
      label: "Critical Data Replication Factor",
      componentId: "primary-data-store",
    },
    {
      key: LOW_PRIORITY_REPLICATION_FACTOR_KEY,
      label: "Low-Priority Data Replication Factor",
      componentId: "primary-data-store",
    },
    {
      key: STANDARD_REPLICATION_MODE_KEY,
      label: "Standard Data Replication Mode",
      componentId: "replication-layer",
      valueLabels: { sync: "Synchronous", "async-batched": "Async / Batched" },
    },
    {
      key: LOW_PRIORITY_REGION_FAN_OUT_KEY,
      label: "Low-Priority Region Fan-Out",
      componentId: "replication-layer",
      valueLabels: { "all-regions": "All Regions", "origin-plus-one": "Origin + One DR Region" },
    },
    {
      key: TRANSFER_COMPRESSION_KEY,
      label: "Transfer Compression",
      componentId: "replication-layer",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: ARCHIVE_REPLICATION_MODE_KEY,
      label: "Archive Replication Mode",
      componentId: "archive-object-storage",
      valueLabels: { "full-sync": "Full Sync", "scheduled-batch": "Scheduled Batch" },
    },
    {
      key: CRITICAL_DATA_PINNING_KEY,
      label: "Critical Data Pinning",
      componentId: "primary-data-store",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: TRANSFER_BATCHING_KEY,
      label: "Transfer Batching",
      componentId: "replication-layer",
      valueLabels: { "small-frequent": "Small / Frequent", "large-batched": "Large / Batched" },
    },
  ],
  components: [
    { id: "us-region", label: "US Region" },
    { id: "eu-region", label: "EU Region" },
    { id: "apac-region", label: "APAC Region" },
    { id: "replication-layer", label: "Replication Layer" },
    { id: "primary-data-store", label: "Primary Data Store" },
    { id: "archive-object-storage", label: "Archive / Object Storage" },
  ],
};
