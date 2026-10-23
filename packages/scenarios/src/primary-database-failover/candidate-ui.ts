import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CONNECTION_DRAIN_KEY,
  FAILOVER_INITIATED_KEY,
  OLD_PRIMARY_FENCING_KEY,
  PROMOTION_TIMING_KEY,
  REPLICA_COUNT_KEY,
  WRITE_ROUTING_POLICY_KEY,
} from "./controls";

export const primaryDatabaseFailoverCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "primaryHealthPct", label: "Primary Health", sourceStateKey: "primaryHealthPct", format: "percentage" },
    { key: "replicationLagMs", label: "Replication Lag", sourceStateKey: "replicationLagMs", format: "duration" },
    { key: "replicaHealthPct", label: "Replica Health", sourceStateKey: "replicaHealthPct", format: "percentage" },
    { key: "writeSuccessRatePct", label: "Write Success Rate", sourceStateKey: "writeSuccessRatePct", format: "percentage" },
    { key: "readSuccessRatePct", label: "Read Success Rate", sourceStateKey: "readSuccessRatePct", format: "percentage" },
    { key: "connectionPoolUtilizationPct", label: "Connection Pool Utilization", sourceStateKey: "connectionPoolUtilizationPct", format: "percentage" },
    { key: "oldPrimaryReachable", label: "Old Primary Reachability", sourceStateKey: "oldPrimaryReachable", format: "status" },
    { key: "primaryStatus", label: "Primary Status", sourceStateKey: "primaryStatus", format: "status" },
  ],
  controls: [
    {
      key: FAILOVER_INITIATED_KEY,
      label: "Failover",
      componentId: "db-proxy",
      valueLabels: { false: "Not initiated", true: "Initiated" },
    },
    {
      key: PROMOTION_TIMING_KEY,
      label: "Promotion Timing",
      componentId: "replica",
      valueLabels: { immediate: "Immediate", waitForLagDrain: "Wait for lag to drain" },
    },
    {
      key: OLD_PRIMARY_FENCING_KEY,
      label: "Old Primary Fencing",
      componentId: "primary",
      valueLabels: { false: "Not fenced", true: "Fenced" },
    },
    {
      key: CONNECTION_DRAIN_KEY,
      label: "Connection Draining",
      componentId: "db-proxy",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: WRITE_ROUTING_POLICY_KEY,
      label: "Write Routing Policy",
      componentId: "db-proxy",
      valueLabels: { oldPrimary: "Old Primary", newPrimary: "New Primary (Promoted Replica)" },
    },
    {
      key: REPLICA_COUNT_KEY,
      label: "Replica Count",
      componentId: "replica",
    },
  ],
  components: [
    { id: "application-services", label: "Application Services" },
    { id: "db-proxy", label: "DB Proxy" },
    { id: "primary", label: "Primary" },
    { id: "replica", label: "Replica" },
  ],
};
