import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CACHE_EVICTION_POLICY_ENABLED_KEY,
  MANUAL_RESTART_TRIGGERED_KEY,
  MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
} from "./controls";

export const memoryLeakCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "memoryUsageMb", label: "Memory Usage", sourceStateKey: "memoryUsageMb", format: "number" },
    { key: "gcPauseMs", label: "GC Pause Time", sourceStateKey: "gcPauseMs", format: "duration" },
    { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
    { key: "processRestartCount", label: "Process Restart Count", sourceStateKey: "processRestartCount", format: "number" },
    { key: "serviceStatus", label: "Service Status", sourceStateKey: "serviceStatus", format: "status" },
  ],
  controls: [
    {
      key: MANUAL_RESTART_TRIGGERED_KEY,
      label: "Trigger Manual Restart",
      componentId: "process-supervisor",
      valueLabels: { false: "No", true: "Restart Now" },
    },
    {
      key: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
      label: "Memory-Limit Auto-Restart",
      componentId: "process-supervisor",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: CACHE_EVICTION_POLICY_ENABLED_KEY,
      label: "Cache Eviction Policy",
      componentId: "in-memory-cache",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "api-service", label: "API Service" },
    { id: "request-handler", label: "Request Handler" },
    { id: "in-memory-cache", label: "In-Memory Cache" },
    { id: "process-supervisor", label: "Process Supervisor" },
    { id: "downstream-database", label: "Downstream Database" },
  ],
};
