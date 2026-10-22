import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_SERVICE_INSTANCES_KEY,
  CONFIG_CHANGE_FREEZE_ENABLED_KEY,
  CONFIG_REVERT_ENABLED_KEY,
} from "./controls";

export const badConfigurationRolloutCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestRejectionRate", label: "Request Rejection Rate", sourceStateKey: "requestRejectionRate", format: "percentage" },
    { key: "affectedUserCount", label: "Affected Users", sourceStateKey: "affectedUserCount", format: "number" },
    { key: "apiServiceCpuUtilization", label: "API Service CPU", sourceStateKey: "apiServiceCpuUtilization", format: "percentage" },
    { key: "timeSinceConfigPushMs", label: "Time Since Config Push", sourceStateKey: "timeSinceConfigPushMs", format: "duration" },
    { key: "configStatus", label: "Config Status", sourceStateKey: "configStatus", format: "status" },
  ],
  controls: [
    {
      key: CONFIG_REVERT_ENABLED_KEY,
      label: "Revert to Last-Known-Good Config",
      componentId: "config-service",
      valueLabels: { false: "Off", true: "On" },
    },
    { key: API_SERVICE_INSTANCES_KEY, label: "API Service Instances", componentId: "api-service" },
    {
      key: CONFIG_CHANGE_FREEZE_ENABLED_KEY,
      label: "Config Change Freeze",
      componentId: "config-service",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "config-service", label: "Config Service" },
    { id: "api-service", label: "API Service" },
    { id: "backend-service", label: "Backend Service" },
    { id: "client", label: "Client" },
  ],
};
