import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  MAX_INSTANCE_COUNT_KEY,
  SCALE_UP_COOLDOWN_SECONDS_KEY,
  SCALE_UP_THRESHOLD_PERCENT_KEY,
} from "./controls";

export const autoscalingFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "currentInstanceCount", label: "Current Instance Count", sourceStateKey: "currentInstanceCount", format: "number" },
    { key: "requestQueueDepth", label: "Request Queue Depth", sourceStateKey: "requestQueueDepth", format: "number" },
    { key: "cpuUtilizationPercent", label: "CPU Utilization", sourceStateKey: "cpuUtilizationPercent", format: "percentage" },
    { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
    { key: "capacityStatus", label: "Capacity Status", sourceStateKey: "capacityStatus", format: "status" },
  ],
  controls: [
    { key: MAX_INSTANCE_COUNT_KEY, label: "Max Instance Count", componentId: "autoscaling-group" },
    {
      key: SCALE_UP_COOLDOWN_SECONDS_KEY,
      label: "Scale-Up Cooldown",
      componentId: "autoscaler-controller",
      valueLabels: { "300": "5m", "120": "2m", "60": "1m", "30": "30s" },
    },
    {
      key: SCALE_UP_THRESHOLD_PERCENT_KEY,
      label: "Scale-Up Threshold",
      componentId: "autoscaler-controller",
      valueLabels: { "95": "95%", "85": "85%", "70": "70%", "50": "50%" },
    },
  ],
  components: [
    { id: "load-balancer", label: "Load Balancer" },
    { id: "autoscaler-controller", label: "Autoscaler Controller" },
    { id: "autoscaling-group", label: "Autoscaling Group" },
    { id: "backend-service", label: "Backend Service" },
    { id: "database", label: "Database" },
  ],
};
