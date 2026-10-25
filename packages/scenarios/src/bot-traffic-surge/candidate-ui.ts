import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CACHE_AGGRESSIVENESS_KEY,
  CHALLENGE_POLICY_KEY,
  ENDPOINT_PROTECTION_SCOPE_KEY,
  RATE_LIMIT_TIER_KEY,
  TENANT_QUOTA_ENFORCEMENT_KEY,
  TRAFFIC_SAMPLING_ENABLED_KEY,
} from "./controls";

export const botTrafficSurgeCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestVolumePerSec", label: "Request Volume", sourceStateKey: "requestVolumePerSec", format: "number" },
    { key: "suspiciousTrafficRatioPct", label: "Suspicious Traffic Ratio", sourceStateKey: "suspiciousTrafficRatioPct", format: "percentage" },
    { key: "customerSuccessRatePct", label: "Customer Success Rate", sourceStateKey: "customerSuccessRatePct", format: "percentage" },
    { key: "falsePositiveRatePct", label: "False-Positive Rate", sourceStateKey: "falsePositiveRatePct", format: "percentage" },
    { key: "backendLoadPct", label: "Backend Load", sourceStateKey: "backendLoadPct", format: "percentage" },
    { key: "rateLimitBlocksPerSec", label: "Rate-Limit Blocks / sec", sourceStateKey: "rateLimitBlocksPerSec", format: "number" },
    { key: "trafficStatus", label: "Traffic Status", sourceStateKey: "trafficStatus", format: "status" },
  ],
  controls: [
    {
      key: CHALLENGE_POLICY_KEY,
      label: "Challenge Policy",
      componentId: "edge-gateway",
      valueLabels: { off: "Off", light: "Light", aggressive: "Aggressive" },
    },
    {
      key: RATE_LIMIT_TIER_KEY,
      label: "Rate Limit Tier",
      componentId: "edge-gateway",
      valueLabels: { normal: "Normal", strict: "Strict" },
    },
    {
      key: TRAFFIC_SAMPLING_ENABLED_KEY,
      label: "Traffic Sampling",
      componentId: "edge-gateway",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: ENDPOINT_PROTECTION_SCOPE_KEY,
      label: "Endpoint Protection Scope",
      componentId: "api",
      valueLabels: { none: "None", global: "Global", targeted: "Targeted" },
    },
    {
      key: TENANT_QUOTA_ENFORCEMENT_KEY,
      label: "Tenant Quota Enforcement",
      componentId: "api",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: CACHE_AGGRESSIVENESS_KEY,
      label: "Cache Aggressiveness",
      componentId: "core-services",
      valueLabels: { normal: "Normal", elevated: "Elevated" },
    },
  ],
  components: [
    { id: "internet-traffic", label: "Internet Traffic" },
    { id: "edge-gateway", label: "Edge / Gateway" },
    { id: "api", label: "API" },
    { id: "core-services", label: "Core Services" },
  ],
};
