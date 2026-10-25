import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BACKPRESSURE_KEY,
  BATCH_SIZE_KEY,
  CHECKPOINT_CADENCE_KEY,
  DATASET_PRIORITY_KEY,
  DROP_EVENTS_KEY,
  LOW_PRIORITY_INGESTION_THROTTLE_KEY,
  PROCESSOR_CONCURRENCY_KEY,
  WAREHOUSE_WRITER_CONCURRENCY_KEY,
} from "./controls";

export const dataPipelineFreshnessCollapseCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "sourceSystemsHealthPct", label: "Source Systems Health", sourceStateKey: "sourceSystemsHealthPct", format: "percentage" },
    { key: "ingestionSuccessRate", label: "Ingestion Success Rate", sourceStateKey: "ingestionSuccessRate", format: "percentage" },
    { key: "processorLagSeconds", label: "Stream Processor Lag (s)", sourceStateKey: "processorLagSeconds", format: "duration" },
    { key: "processorStatus", label: "Stream Processor Status", sourceStateKey: "processorStatus", format: "status" },
    { key: "tier1FreshnessSeconds", label: "Tier-1 Freshness (s, SLO 120s)", sourceStateKey: "tier1FreshnessSeconds", format: "duration" },
    { key: "tier2FreshnessSeconds", label: "Tier-2 Freshness (s)", sourceStateKey: "tier2FreshnessSeconds", format: "duration" },
    { key: "tier1BacklogCount", label: "Tier-1 Backlog", sourceStateKey: "tier1BacklogCount", format: "number" },
    { key: "tier2BacklogCount", label: "Tier-2 Backlog", sourceStateKey: "tier2BacklogCount", format: "number" },
    { key: "warehouseWriteSuccessRate", label: "Warehouse Write Success Rate", sourceStateKey: "warehouseWriteSuccessRate", format: "percentage" },
    { key: "warehouseStatus", label: "Warehouse Status", sourceStateKey: "warehouseStatus", format: "status" },
    { key: "warehouseWriteLockWaitMs", label: "Warehouse Write Lock Wait (ms)", sourceStateKey: "warehouseWriteLockWaitMs", format: "number" },
    { key: "droppedEventCount", label: "Dropped Events (historical)", sourceStateKey: "droppedEventCount", format: "number" },
    { key: "servingFreshnessStatus", label: "Serving Freshness Status", sourceStateKey: "servingFreshnessStatus", format: "status" },
    { key: "pipelineStatus", label: "Pipeline Status", sourceStateKey: "pipelineStatus", format: "status" },
  ],
  controls: [
    {
      key: PROCESSOR_CONCURRENCY_KEY,
      label: "Processor Concurrency",
      componentId: "stream-processor",
      valueLabels: { normal: "Normal", high: "High" },
    },
    {
      key: DATASET_PRIORITY_KEY,
      label: "Dataset Priority",
      componentId: "stream-processor",
      valueLabels: { balanced: "Balanced", "tier1-first": "Tier-1 First" },
    },
    {
      key: LOW_PRIORITY_INGESTION_THROTTLE_KEY,
      label: "Low-Priority Ingestion Throttle",
      componentId: "ingestion",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: BATCH_SIZE_KEY,
      label: "Batch Size",
      componentId: "stream-processor",
      valueLabels: { large: "Large", small: "Small" },
    },
    {
      key: WAREHOUSE_WRITER_CONCURRENCY_KEY,
      label: "Warehouse Writer Concurrency",
      componentId: "warehouse",
      valueLabels: { normal: "Normal", high: "High" },
    },
    {
      key: CHECKPOINT_CADENCE_KEY,
      label: "Checkpoint Cadence",
      componentId: "warehouse",
      valueLabels: { normal: "Normal", relaxed: "Relaxed" },
    },
    {
      key: BACKPRESSURE_KEY,
      label: "Backpressure",
      componentId: "stream-processor",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: DROP_EVENTS_KEY,
      label: "Drop Events",
      componentId: "stream-processor",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "source-systems", label: "Source Systems" },
    { id: "ingestion", label: "Ingestion" },
    { id: "stream-processor", label: "Stream Processor" },
    { id: "warehouse", label: "Warehouse" },
    { id: "serving-layer", label: "Serving Layer / Reports" },
  ],
};
