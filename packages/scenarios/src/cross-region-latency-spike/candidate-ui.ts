import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CROSS_REGION_DEPENDENCY_KEY,
  GENERAL_CONSISTENCY_MODE_KEY,
  PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
  READ_ROUTING_KEY,
  REGIONAL_FAILOVER_KEY,
  TRAFFIC_LOCALITY_KEY,
} from "./controls";

export const crossRegionLatencySpikeCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "interRegionRttMs", label: "Inter-Region RTT", sourceStateKey: "interRegionRttMs", format: "duration" },
    { key: "replicationLagMs", label: "Replication Lag", sourceStateKey: "replicationLagMs", format: "duration" },
    { key: "syncWriteLatencyMs", label: "Synchronous Write Latency", sourceStateKey: "syncWriteLatencyMs", format: "duration" },
    { key: "usCustomerLatencyMs", label: "US Customer Latency", sourceStateKey: "usCustomerLatencyMs", format: "duration" },
    { key: "euCustomerLatencyMs", label: "EU Customer Latency", sourceStateKey: "euCustomerLatencyMs", format: "duration" },
    { key: "crossRegionRequestVolume", label: "Cross-Region Request Volume", sourceStateKey: "crossRegionRequestVolume", format: "number" },
    { key: "backboneStatus", label: "Backbone Status", sourceStateKey: "backboneStatus", format: "status" },
  ],
  controls: [
    {
      key: TRAFFIC_LOCALITY_KEY,
      label: "Traffic Locality",
      componentId: "global-services",
      valueLabels: { nearest: "Nearest Region", alwaysGlobal: "Always Global" },
    },
    {
      key: GENERAL_CONSISTENCY_MODE_KEY,
      label: "General Consistency Mode",
      componentId: "global-services",
      valueLabels: { synchronous: "Synchronous", eventual: "Eventual" },
    },
    {
      key: PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
      label: "Payment Auth Consistency Mode",
      componentId: "global-services",
      valueLabels: { synchronous: "Synchronous", eventual: "Eventual" },
    },
    {
      key: READ_ROUTING_KEY,
      label: "Read Routing",
      componentId: "global-services",
      valueLabels: { localRegion: "Local Region", primaryRegion: "Primary Region" },
    },
    {
      key: CROSS_REGION_DEPENDENCY_KEY,
      label: "Cross-Region Dependency Usage",
      componentId: "global-services",
      valueLabels: { required: "Required", localOnly: "Local Only" },
    },
    {
      key: REGIONAL_FAILOVER_KEY,
      label: "Regional Failover",
      componentId: "global-services",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "us-region", label: "US Region" },
    { id: "global-services", label: "Global Services" },
    { id: "eu-region", label: "EU Region" },
  ],
};
