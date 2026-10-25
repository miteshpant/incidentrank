import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  APAC_ROUTING_MODE_KEY,
  DEPENDENCY_FALLBACK_ENABLED_KEY,
  EU_ROUTING_MODE_KEY,
  GLOBAL_CIRCUIT_BREAKER_KEY,
  TIMEOUT_POLICY_MS_KEY,
  US_ROUTING_MODE_KEY,
} from "./controls";

export const partialRegionalDependencyFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "usSuccessRate", label: "US Success Rate", sourceStateKey: "usSuccessRate", format: "percentage" },
    { key: "euSuccessRate", label: "EU Success Rate", sourceStateKey: "euSuccessRate", format: "percentage" },
    { key: "apacSuccessRate", label: "APAC Success Rate", sourceStateKey: "apacSuccessRate", format: "percentage" },
    { key: "usLatencyMs", label: "US Dependency Latency", sourceStateKey: "usLatencyMs", format: "duration" },
    { key: "euLatencyMs", label: "EU Dependency Latency", sourceStateKey: "euLatencyMs", format: "duration" },
    { key: "apacLatencyMs", label: "APAC Dependency Latency", sourceStateKey: "apacLatencyMs", format: "duration" },
    { key: "usDependencyHealth", label: "US Dependency Health", sourceStateKey: "usDependencyHealth", format: "status" },
    { key: "euDependencyHealth", label: "EU Dependency Health", sourceStateKey: "euDependencyHealth", format: "status" },
    { key: "apacDependencyHealth", label: "APAC Dependency Health", sourceStateKey: "apacDependencyHealth", format: "status" },
    { key: "fallbackTrafficPercent", label: "Fallback Traffic", sourceStateKey: "fallbackTrafficPercent", format: "percentage" },
    { key: "crossRegionRequestVolumePerMinute", label: "Cross-Region Request Volume", sourceStateKey: "crossRegionRequestVolumePerMinute", format: "number" },
    { key: "globalCustomerSuccessRate", label: "Global Customer Success", sourceStateKey: "globalCustomerSuccessRate", format: "percentage" },
  ],
  controls: [
    {
      key: US_ROUTING_MODE_KEY,
      label: "US Routing Mode",
      componentId: "us-regional-service",
      valueLabels: { normal: "Normal", isolate: "Isolate from Dependency" },
    },
    {
      key: EU_ROUTING_MODE_KEY,
      label: "EU Routing Mode",
      componentId: "eu-regional-service",
      valueLabels: { normal: "Normal", isolate: "Isolate from Dependency" },
    },
    {
      key: APAC_ROUTING_MODE_KEY,
      label: "APAC Routing Mode",
      componentId: "apac-regional-service",
      valueLabels: { normal: "Normal", isolate: "Isolate from Dependency" },
    },
    {
      key: DEPENDENCY_FALLBACK_ENABLED_KEY,
      label: "Dependency Fallback",
      componentId: "shared-dependency",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: TIMEOUT_POLICY_MS_KEY,
      label: "Global Timeout Policy",
      componentId: "shared-dependency",
    },
    {
      key: GLOBAL_CIRCUIT_BREAKER_KEY,
      label: "Global Circuit Breaker",
      componentId: "shared-dependency",
      valueLabels: { false: "Closed", true: "Tripped" },
    },
  ],
  components: [
    { id: "global-api", label: "Global API" },
    { id: "us-regional-service", label: "US Regional Service" },
    { id: "eu-regional-service", label: "EU Regional Service" },
    { id: "apac-regional-service", label: "APAC Regional Service" },
    { id: "shared-dependency", label: "Shared Dependency" },
  ],
};
