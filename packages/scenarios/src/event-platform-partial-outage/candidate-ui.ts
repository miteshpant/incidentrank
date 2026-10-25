import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BATCH_SIZE_KEY,
  CONSUMER_B_CONCURRENCY_KEY,
  CONSUMER_C_RETRY_MODE_KEY,
  DLQ_POLICY_KEY,
  DOWNSTREAM_CIRCUIT_BREAKER_KEY,
  PARTITION_ISOLATION_KEY,
  PRODUCER_BACKPRESSURE_KEY,
  TOPIC_A_PRIORITY_KEY,
} from "./controls";

export const eventPlatformPartialOutageCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "brokerPartitionHealth", label: "Broker Partition Health", sourceStateKey: "brokerPartitionHealth", format: "percentage" },
    { key: "topicADurabilityPct", label: "Topic A Durability", sourceStateKey: "topicADurabilityPct", format: "percentage" },
    { key: "topicAEventsDroppedTotal", label: "Topic A Events Dropped (Total)", sourceStateKey: "topicAEventsDroppedTotal", format: "number" },
    { key: "consumerBLagMessages", label: "Consumer Group B Lag", sourceStateKey: "consumerBLagMessages", format: "number" },
    { key: "consumerBStatus", label: "Consumer Group B Status", sourceStateKey: "consumerBStatus", format: "status" },
    { key: "consumerCRetryRatePerMinute", label: "Consumer Group C Retry Rate / min", sourceStateKey: "consumerCRetryRatePerMinute", format: "number" },
    { key: "downstreamHealthPct", label: "Downstream DB/API Health", sourceStateKey: "downstreamHealthPct", format: "percentage" },
    { key: "dlqBacklogCount", label: "DLQ Backlog", sourceStateKey: "dlqBacklogCount", format: "number" },
    { key: "topicBBacklogMessages", label: "Topic B Backlog", sourceStateKey: "topicBBacklogMessages", format: "number" },
    { key: "platformStatus", label: "Platform Status", sourceStateKey: "platformStatus", format: "status" },
  ],
  controls: [
    {
      key: PRODUCER_BACKPRESSURE_KEY,
      label: "Producer Backpressure",
      componentId: "event-gateway",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: TOPIC_A_PRIORITY_KEY,
      label: "Topic A Priority",
      componentId: "topic-a",
      valueLabels: { normal: "Normal", protected: "Protected" },
    },
    {
      key: PARTITION_ISOLATION_KEY,
      label: "Partition Isolation",
      componentId: "broker-cluster",
      valueLabels: { unisolated: "Unisolated", isolated: "Isolated" },
    },
    {
      key: CONSUMER_B_CONCURRENCY_KEY,
      label: "Consumer Group B Concurrency",
      componentId: "consumer-group-b",
      valueLabels: { "2": "2", "4": "4", "8": "8", "16": "16" },
    },
    {
      key: CONSUMER_C_RETRY_MODE_KEY,
      label: "Consumer Group C Retry Mode",
      componentId: "consumer-group-c",
      valueLabels: { aggressive: "Aggressive", bounded: "Bounded", "circuit-breaker": "Circuit Breaker" },
    },
    {
      key: DOWNSTREAM_CIRCUIT_BREAKER_KEY,
      label: "Downstream Circuit Breaker",
      componentId: "downstream-systems",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: DLQ_POLICY_KEY,
      label: "DLQ Policy",
      componentId: "consumer-group-c",
      valueLabels: { disabled: "Disabled", enabled: "Enabled" },
    },
    {
      key: BATCH_SIZE_KEY,
      label: "Batch Size",
      componentId: "broker-cluster",
      valueLabels: { "100": "100", "500": "500", "2000": "2000" },
    },
  ],
  components: [
    { id: "producers", label: "Producers" },
    { id: "event-gateway", label: "Event Gateway" },
    { id: "broker-cluster", label: "Broker Cluster" },
    { id: "topic-a", label: "Topic A" },
    { id: "topic-b", label: "Topic B" },
    { id: "topic-c", label: "Topic C" },
    { id: "consumer-group-a", label: "Consumer Group A" },
    { id: "consumer-group-b", label: "Consumer Group B" },
    { id: "consumer-group-c", label: "Consumer Group C" },
    { id: "downstream-systems", label: "Databases / External APIs" },
  ],
};
