import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CANARY_TRAFFIC_PERCENT_KEY,
  DEBUG_LOGGING_ENABLED_KEY,
  ROLLBACK_TO_PREVIOUS_VERSION_KEY,
} from "./controls";

export const deploymentRegressionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
    { key: "latencyP99Ms", label: "Latency P99", sourceStateKey: "latencyP99Ms", format: "duration" },
    { key: "memoryUsageMb", label: "Memory Usage", sourceStateKey: "memoryUsageMb", format: "number" },
    { key: "affectedRequestCount", label: "Affected Requests", sourceStateKey: "affectedRequestCount", format: "number" },
    { key: "deployStatus", label: "Deploy Status", sourceStateKey: "deployStatus", format: "status" },
  ],
  controls: [
    {
      key: ROLLBACK_TO_PREVIOUS_VERSION_KEY,
      label: "Rollback to Previous Version",
      componentId: "previous-version",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: CANARY_TRAFFIC_PERCENT_KEY,
      label: "Canary Traffic Percent",
      componentId: "app-service",
      valueLabels: { "0": "0%", "10": "10%", "50": "50%", "100": "100%" },
    },
    {
      key: DEBUG_LOGGING_ENABLED_KEY,
      label: "Debug Logging",
      componentId: "app-service",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "deploy-pipeline", label: "Deploy Pipeline" },
    { id: "app-service", label: "App Service" },
    { id: "database", label: "Database" },
    { id: "previous-version", label: "Previous Version" },
  ],
};
