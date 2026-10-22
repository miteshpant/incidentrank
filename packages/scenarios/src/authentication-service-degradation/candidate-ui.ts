import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  AUTH_SERVICE_INSTANCES_KEY,
  SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
  TOKEN_CACHE_TTL_SECONDS_KEY,
} from "./controls";

export const authenticationServiceDegradationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "authServiceLatencyMs", label: "Auth Service Latency", sourceStateKey: "authServiceLatencyMs", format: "duration" },
    { key: "authFailureRate", label: "Auth Failure Rate", sourceStateKey: "authFailureRate", format: "percentage" },
    { key: "tokenValidationThroughput", label: "Token Validation Throughput", sourceStateKey: "tokenValidationThroughput", format: "number" },
    { key: "activeSessionCount", label: "Active Sessions", sourceStateKey: "activeSessionCount", format: "number" },
    { key: "authServiceStatus", label: "Auth Service Status", sourceStateKey: "authServiceStatus", format: "status" },
  ],
  controls: [
    { key: AUTH_SERVICE_INSTANCES_KEY, label: "Auth Service Instances", componentId: "auth-service" },
    {
      key: TOKEN_CACHE_TTL_SECONDS_KEY,
      label: "Token Cache TTL",
      componentId: "token-cache",
      valueLabels: { "30": "30s", "120": "2m", "300": "5m", "1800": "30m" },
    },
    {
      key: SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
      label: "Signature Verification Bypass",
      componentId: "auth-service",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "auth-service", label: "Auth Service" },
    { id: "token-cache", label: "Token Cache" },
    { id: "identity-database", label: "Identity Database" },
    { id: "protected-service", label: "Protected Service" },
  ],
};
