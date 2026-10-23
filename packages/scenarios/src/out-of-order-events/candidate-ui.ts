import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CONSUMER_PARALLELISM_KEY,
  DELAYED_PROCESSING_TOLERANCE_KEY,
  PARTITION_KEY_STRATEGY_KEY,
  REORDER_BUFFER_ENABLED_KEY,
  SEQUENCE_VALIDATION_ENABLED_KEY,
} from "./controls";

export const outOfOrderEventsCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "eventsPerSecond", label: "Throughput", sourceStateKey: "eventsPerSecond", format: "number" },
    { key: "consumerLagMessages", label: "Consumer Lag", sourceStateKey: "consumerLagMessages", format: "number" },
    { key: "orderingViolationRate", label: "Ordering Violation Rate", sourceStateKey: "orderingViolationRate", format: "number" },
    { key: "unreconciledViolationCount", label: "Unreconciled Violations", sourceStateKey: "unreconciledViolationCount", format: "number" },
    { key: "reconciliationRatePerSecond", label: "Reconciliation Rate", sourceStateKey: "reconciliationRatePerSecond", format: "number" },
    { key: "staleStateCorrectionRate", label: "Stale-State Correction Rate", sourceStateKey: "staleStateCorrectionRate", format: "number" },
    { key: "materializedStateStatus", label: "Materialized State Status", sourceStateKey: "materializedStateStatus", format: "status" },
  ],
  controls: [
    {
      key: PARTITION_KEY_STRATEGY_KEY,
      label: "Partition Key Strategy",
      componentId: "event-stream",
      valueLabels: { "account-id-keyed": "Account ID Keyed", "round-robin": "Round Robin" },
    },
    {
      key: CONSUMER_PARALLELISM_KEY,
      label: "Consumer Parallelism",
      componentId: "consumers",
    },
    {
      key: REORDER_BUFFER_ENABLED_KEY,
      label: "Reorder Buffer",
      componentId: "consumers",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: SEQUENCE_VALIDATION_ENABLED_KEY,
      label: "Sequence Validation",
      componentId: "consumers",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: DELAYED_PROCESSING_TOLERANCE_KEY,
      label: "Delayed-Processing Tolerance",
      componentId: "consumers",
      valueLabels: { "0": "None", "500": "500ms", "5000": "5s" },
    },
  ],
  components: [
    { id: "producers", label: "Producers" },
    { id: "event-stream", label: "Partitioned Event Stream" },
    { id: "consumers", label: "Stateful Consumers" },
    { id: "materialized-state", label: "Materialized State" },
  ],
};
