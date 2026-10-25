import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_CONCURRENCY_KEY,
  FAILOVER_SHARD2_KEY,
  HOT_TENANT_THROTTLE_KEY,
  READ_ROUTING_KEY,
  RECONCILE_STRANDED_WRITES_KEY,
  REPLICA_CATCHUP_PRIORITY_KEY,
  WRITE_THROTTLE_SHARD2_KEY,
} from "./controls";

export const hotShardReplicaLagFailoverRiskCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "shard2PrimaryRequestRate", label: "Shard 2 Primary Request Rate", sourceStateKey: "shard2PrimaryRequestRate", format: "number" },
    { key: "shard2PrimaryWriteLatencyMs", label: "Shard 2 Primary Write Latency", sourceStateKey: "shard2PrimaryWriteLatencyMs", format: "duration" },
    { key: "shard2PrimaryQueueDepth", label: "Shard 2 Primary Queue Depth", sourceStateKey: "shard2PrimaryQueueDepth", format: "number" },
    { key: "shard2ReplicaLagSeconds", label: "Shard 2 Replica Lag (s)", sourceStateKey: "shard2ReplicaLagSeconds", format: "duration" },
    { key: "shard2ReplicaProcessHealthPct", label: "Shard 2 Replica Process Health", sourceStateKey: "shard2ReplicaProcessHealthPct", format: "percentage" },
    { key: "apiCustomerLatencyMs", label: "API Customer Latency", sourceStateKey: "apiCustomerLatencyMs", format: "duration" },
    { key: "otherShardsPrimaryRequestRate", label: "Other Shards Request Rate", sourceStateKey: "otherShardsPrimaryRequestRate", format: "number" },
    { key: "shard2HotTenantTrafficSharePct", label: "Shard 2 Hot-Tenant Traffic Share", sourceStateKey: "shard2HotTenantTrafficSharePct", format: "percentage" },
    { key: "shard2StrandedAcknowledgedWriteCount", label: "Shard 2 Stranded Acknowledged Writes", sourceStateKey: "shard2StrandedAcknowledgedWriteCount", format: "number" },
    { key: "shard2CorrectnessRiskStatus", label: "Shard 2 Correctness Risk", sourceStateKey: "shard2CorrectnessRiskStatus", format: "status" },
  ],
  controls: [
    {
      key: HOT_TENANT_THROTTLE_KEY,
      label: "Hot-Tenant Throttle",
      componentId: "shard2-primary",
      valueLabels: { off: "Off", moderate: "Moderate", strict: "Strict" },
    },
    {
      key: API_CONCURRENCY_KEY,
      label: "API Concurrency",
      componentId: "api",
      valueLabels: { normal: "Normal", high: "High" },
    },
    {
      key: REPLICA_CATCHUP_PRIORITY_KEY,
      label: "Replica Catch-Up Priority",
      componentId: "shard2-replica",
      valueLabels: { normal: "Normal", prioritized: "Prioritized" },
    },
    {
      key: FAILOVER_SHARD2_KEY,
      label: "Failover Shard 2",
      componentId: "shard2-replica",
      valueLabels: { false: "No", true: "Yes" },
    },
    {
      key: READ_ROUTING_KEY,
      label: "Shard 2 Read Routing",
      componentId: "shard-router",
      valueLabels: { "primary-only": "Primary Only", "replica-allowed": "Replica Allowed" },
    },
    {
      key: WRITE_THROTTLE_SHARD2_KEY,
      label: "Shard 2 Write Throttle",
      componentId: "shard2-primary",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: RECONCILE_STRANDED_WRITES_KEY,
      label: "Reconcile Stranded Writes",
      componentId: "shard2-replica",
      valueLabels: { off: "Off", active: "Active" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api", label: "API" },
    { id: "shard-router", label: "Shard Router" },
    { id: "shard1-primary", label: "Shard 1 Primary" },
    { id: "shard1-replica", label: "Shard 1 Replica" },
    { id: "shard2-primary", label: "Shard 2 Primary" },
    { id: "shard2-replica", label: "Shard 2 Replica" },
    { id: "shard3-primary", label: "Shard 3 Primary" },
    { id: "shard3-replica", label: "Shard 3 Replica" },
    { id: "shard4-primary", label: "Shard 4 Primary" },
    { id: "shard4-replica", label: "Shard 4 Replica" },
  ],
};
