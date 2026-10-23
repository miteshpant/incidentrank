import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
  ENDPOINT_CACHE_TTL_SECONDS_KEY,
  FALLBACK_ROUTING_KEY,
  HEALTH_CHECK_POLICY_KEY,
  RETRY_COUNT_KEY,
} from "./controls";

export const serviceDiscoveryFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "connectionFailuresPerMinute",
      label: "Connection Failures / min",
      sourceStateKey: "connectionFailuresPerMinute",
      format: "number",
    },
    {
      key: "healthyEndpointCount",
      label: "Healthy Endpoint Count",
      sourceStateKey: "healthyEndpointCount",
      format: "number",
    },
    {
      key: "discoveryRefreshAgeSeconds",
      label: "Discovery Refresh Age",
      sourceStateKey: "discoveryRefreshAgeSeconds",
      format: "duration",
    },
    {
      key: "serviceCLatencyMs",
      label: "Service C Latency",
      sourceStateKey: "serviceCLatencyMs",
      format: "duration",
    },
    {
      key: "retryVolumePerMinute",
      label: "Retry Volume / min",
      sourceStateKey: "retryVolumePerMinute",
      format: "number",
    },
    {
      key: "discoveryStatus",
      label: "Discovery Status",
      sourceStateKey: "discoveryStatus",
      format: "status",
    },
  ],
  controls: [
    {
      key: DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
      label: "Discovery Refresh Interval",
      componentId: "service-registry",
      valueLabels: { "120": "120s", "30": "30s", "10": "10s", "5": "5s" },
    },
    {
      key: ENDPOINT_CACHE_TTL_SECONDS_KEY,
      label: "Endpoint Cache TTL",
      componentId: "service-a",
      valueLabels: { "300": "300s", "60": "60s", "15": "15s" },
    },
    {
      key: RETRY_COUNT_KEY,
      label: "Retry Count",
      componentId: "service-a",
    },
    {
      key: FALLBACK_ROUTING_KEY,
      label: "Fallback Routing",
      componentId: "service-a",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: HEALTH_CHECK_POLICY_KEY,
      label: "Health-Check Policy",
      componentId: "service-registry",
      valueLabels: { passive: "Passive", aggressive: "Aggressive" },
    },
  ],
  components: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "service-c", label: "Service C" },
    { id: "service-registry", label: "Service Registry" },
  ],
};
