import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DEPENDENCY_PROTECTION_MODE_KEY,
  NEW_VERSION_INSTANCE_COUNT_KEY,
  REGRESSED_FEATURE_ENABLED_KEY,
  ROLLBACK_TO_OLD_VERSION_KEY,
  ROLLOUT_PERCENT_KEY,
  TRAFFIC_ROUTING_MODE_KEY,
} from "./controls";

export const partialRolloutRegressionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "oldVersionErrorRate", label: "Old Version Error Rate", sourceStateKey: "oldVersionErrorRate", format: "percentage" },
    { key: "newVersionErrorRate", label: "New Version Error Rate", sourceStateKey: "newVersionErrorRate", format: "percentage" },
    { key: "oldVersionLatencyMs", label: "Old Version Latency", sourceStateKey: "oldVersionLatencyMs", format: "duration" },
    { key: "newVersionLatencyMs", label: "New Version Latency", sourceStateKey: "newVersionLatencyMs", format: "duration" },
    { key: "customerSuccessRate", label: "Customer Success Rate", sourceStateKey: "customerSuccessRate", format: "percentage" },
    { key: "sharedDependencyPressure", label: "Shared Dependency Pressure", sourceStateKey: "sharedDependencyPressure", format: "percentage" },
    { key: "newVersionMemoryUsageMb", label: "New Version Memory Usage", sourceStateKey: "newVersionMemoryUsageMb", format: "number" },
    { key: "rolloutState", label: "Rollout Status", sourceStateKey: "rolloutState", format: "status" },
  ],
  controls: [
    {
      key: ROLLOUT_PERCENT_KEY,
      label: "Rollout Percentage",
      componentId: "new-version",
    },
    {
      key: ROLLBACK_TO_OLD_VERSION_KEY,
      label: "Rollback to Old Version",
      componentId: "load-balancer",
      valueLabels: { false: "No", true: "Yes" },
    },
    {
      key: TRAFFIC_ROUTING_MODE_KEY,
      label: "Dependency Pool Routing",
      componentId: "shared-dependency",
      valueLabels: { "shared-pool": "Shared Pool", "isolated-pool": "Isolated Pool" },
    },
    {
      key: REGRESSED_FEATURE_ENABLED_KEY,
      label: "Regressed Feature Flag",
      componentId: "new-version",
      valueLabels: { true: "Enabled", false: "Disabled" },
    },
    {
      key: NEW_VERSION_INSTANCE_COUNT_KEY,
      label: "New Version Instances",
      componentId: "new-version",
    },
    {
      key: DEPENDENCY_PROTECTION_MODE_KEY,
      label: "Dependency Protection",
      componentId: "shared-dependency",
      valueLabels: { none: "None", "circuit-breaker": "Circuit Breaker", "rate-limit": "Rate Limit" },
    },
  ],
  components: [
    { id: "traffic", label: "Traffic" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "old-version", label: "Old Version" },
    { id: "new-version", label: "New Version" },
    { id: "shared-dependency", label: "Shared Dependency" },
  ],
};
