import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CONSUMER_INSTANCE_COUNT_KEY,
  DLQ_ACTION_KEY,
  PARSER_SCHEMA_COMPAT_MODE_KEY,
  REPLAY_FAILURE_FILTER_KEY,
  REPLAY_PAUSED_KEY,
  RETRY_DELAY_MS_KEY,
} from "./controls";

export const deadLetterQueueExplosionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "dlqDepth", label: "DLQ Depth", sourceStateKey: "dlqDepth", format: "number" },
    { key: "dlqGrowthRatePerMin", label: "DLQ Growth Rate", sourceStateKey: "dlqGrowthRatePerMin", format: "number" },
    { key: "mainQueueLagMessages", label: "Main Queue Lag", sourceStateKey: "mainQueueLagMessages", format: "number" },
    { key: "processingErrorRate", label: "Processing Error Rate", sourceStateKey: "processingErrorRate", format: "percentage" },
    { key: "replayThroughputPerMin", label: "Replay Throughput", sourceStateKey: "replayThroughputPerMin", format: "number" },
    { key: "duplicateProcessingRiskScore", label: "Duplicate-Processing Risk", sourceStateKey: "duplicateProcessingRiskScore", format: "number" },
    { key: "consumerStatus", label: "Consumer Status", sourceStateKey: "consumerStatus", format: "status" },
  ],
  controls: [
    {
      key: REPLAY_PAUSED_KEY,
      label: "Pause Replay",
      componentId: "reprocessor",
      valueLabels: { false: "Running", true: "Paused" },
    },
    {
      key: REPLAY_FAILURE_FILTER_KEY,
      label: "Replay Failure Class Filter",
      componentId: "reprocessor",
      valueLabels: { all: "All Failures", schemaOnly: "Schema Failures Only" },
    },
    {
      key: RETRY_DELAY_MS_KEY,
      label: "Retry Delay",
      componentId: "reprocessor",
    },
    {
      key: PARSER_SCHEMA_COMPAT_MODE_KEY,
      label: "Parser Schema Compatibility Mode",
      componentId: "consumer",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: CONSUMER_INSTANCE_COUNT_KEY,
      label: "Consumer Instances",
      componentId: "consumer",
    },
    {
      key: DLQ_ACTION_KEY,
      label: "DLQ Action",
      componentId: "dlq",
      valueLabels: { none: "No Action", discard: "Discard DLQ Events" },
    },
  ],
  components: [
    { id: "events", label: "Events" },
    { id: "consumer", label: "Consumer" },
    { id: "main-processing", label: "Main Processing" },
    { id: "dlq", label: "Dead-Letter Queue" },
    { id: "reprocessor", label: "Reprocessor" },
  ],
};
