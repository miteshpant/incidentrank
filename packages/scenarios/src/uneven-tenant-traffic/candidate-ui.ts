import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CACHING_ENABLED_KEY,
  GLOBAL_FLEET_SCALING_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  TENANT_ISOLATION_KEY,
  WORKLOAD_ROUTING_KEY,
} from "./controls";

export const unevenTenantTrafficCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "hotTenantQps", label: "Hot Tenant QPS", sourceStateKey: "hotTenantQps", format: "number" },
    { key: "globalApiLatencyMs", label: "Global API Latency", sourceStateKey: "globalApiLatencyMs", format: "duration" },
    { key: "otherTenantLatencyMs", label: "Other Tenants' Latency", sourceStateKey: "otherTenantLatencyMs", format: "duration" },
    { key: "sharedFleetUtilizationPct", label: "Shared Fleet Utilization", sourceStateKey: "sharedFleetUtilizationPct", format: "percentage" },
    { key: "sharedDataLayerUtilizationPct", label: "Shared Data Layer Utilization", sourceStateKey: "sharedDataLayerUtilizationPct", format: "percentage" },
    { key: "throttledRequestRatePerSec", label: "Throttled Request Rate", sourceStateKey: "throttledRequestRatePerSec", format: "number" },
    { key: "sharedFleetStatus", label: "Shared Fleet Status", sourceStateKey: "sharedFleetStatus", format: "status" },
  ],
  controls: [
    {
      key: PER_TENANT_QUOTA_KEY,
      label: "Per-Tenant Quota",
      componentId: "multi-tenant-api",
    },
    {
      key: GLOBAL_FLEET_SCALING_KEY,
      label: "Shared Fleet Instances",
      componentId: "shared-service-fleet",
    },
    {
      key: PRIORITY_CLASS_KEY,
      label: "Priority Class",
      componentId: "shared-service-fleet",
      valueLabels: { standard: "Standard", deprioritizeHot: "Deprioritize Hot Tenant" },
    },
    {
      key: TENANT_ISOLATION_KEY,
      label: "Tenant Isolation",
      componentId: "shared-data-layer",
      valueLabels: { false: "Shared", true: "Isolated" },
    },
    {
      key: CACHING_ENABLED_KEY,
      label: "Caching",
      componentId: "shared-data-layer",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: WORKLOAD_ROUTING_KEY,
      label: "Workload Routing",
      componentId: "multi-tenant-api",
      valueLabels: { direct: "Direct", dedicatedLane: "Dedicated Lane" },
    },
  ],
  components: [
    { id: "clients", label: "Tenant Clients" },
    { id: "multi-tenant-api", label: "Multi-Tenant API" },
    { id: "shared-service-fleet", label: "Shared Service Fleet" },
    { id: "shared-data-layer", label: "Shared Data Layer" },
  ],
};
