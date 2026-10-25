import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  LOGIN_CONCURRENCY_LIMIT_KEY,
  MFA_POLICY_BY_RISK_TIER_KEY,
  MFA_RETRY_BACKOFF_KEY,
  PRIVILEGED_ACTION_MODE_KEY,
  RISK_ENGINE_MODE_KEY,
  SESSION_CACHE_MODE_KEY,
  SESSION_TTL_SECONDS_KEY,
  TOKEN_ONLY_CONTINUATION_KEY,
} from "./controls";

export const identityPlatformDegradationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "tokenVerificationSuccessRate", label: "Token Verification Success Rate", sourceStateKey: "tokenVerificationSuccessRate", format: "percentage" },
    { key: "mfaProviderLatencyMs", label: "MFA Provider Latency", sourceStateKey: "mfaProviderLatencyMs", format: "duration" },
    { key: "mfaProviderFailureRate", label: "MFA Provider Failure Rate", sourceStateKey: "mfaProviderFailureRate", format: "percentage" },
    { key: "mfaProviderStatus", label: "MFA Provider Status", sourceStateKey: "mfaProviderStatus", format: "status" },
    { key: "sessionStorePressureLevel", label: "Session Store Pressure", sourceStateKey: "sessionStorePressureLevel", format: "number" },
    { key: "sessionStoreStatus", label: "Session Store Status", sourceStateKey: "sessionStoreStatus", format: "status" },
    { key: "activeSessionsUnnecessarilyInvalidatedCount", label: "Active Sessions Unnecessarily Invalidated", sourceStateKey: "activeSessionsUnnecessarilyInvalidatedCount", format: "number" },
    { key: "lowRiskLoginSuccessRate", label: "Low-Risk Login Success Rate", sourceStateKey: "lowRiskLoginSuccessRate", format: "percentage" },
    { key: "highRiskLoginSuccessRate", label: "High-Risk Login Success Rate", sourceStateKey: "highRiskLoginSuccessRate", format: "percentage" },
    { key: "privilegedActionAvailability", label: "Privileged Action Availability", sourceStateKey: "privilegedActionAvailability", format: "percentage" },
    { key: "highRiskActionsAuthenticatedWithoutMfaCount", label: "High-Risk Actions Authenticated Without MFA (Cumulative)", sourceStateKey: "highRiskActionsAuthenticatedWithoutMfaCount", format: "number" },
    { key: "authSecurityStatus", label: "Authentication Security Status", sourceStateKey: "authSecurityStatus", format: "status" },
  ],
  controls: [
    {
      key: MFA_POLICY_BY_RISK_TIER_KEY,
      label: "MFA Policy by Risk Tier",
      componentId: "risk-engine",
      valueLabels: {
        "mandatory-all": "Mandatory MFA for All",
        "risk-based-bounded-degrade": "Risk-Based Bounded Degrade",
        "bypass-all": "Bypass MFA for All",
      },
    },
    {
      key: SESSION_TTL_SECONDS_KEY,
      label: "Session TTL",
      componentId: "session-store",
      valueLabels: { "300": "5m", "1800": "30m", "7200": "2h" },
    },
    {
      key: TOKEN_ONLY_CONTINUATION_KEY,
      label: "Token-Only Continuation",
      componentId: "token-verification",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: SESSION_CACHE_MODE_KEY,
      label: "Session Cache Mode",
      componentId: "session-store",
      valueLabels: {
        "write-through": "Write-Through",
        "relief-eviction": "Relief Eviction",
        disabled: "Disabled",
      },
    },
    {
      key: LOGIN_CONCURRENCY_LIMIT_KEY,
      label: "Login Concurrency Limit",
      componentId: "auth-orchestrator",
      valueLabels: { normal: "Normal", throttled: "Throttled", unlimited: "Unlimited" },
    },
    {
      key: RISK_ENGINE_MODE_KEY,
      label: "Risk Engine Mode",
      componentId: "risk-engine",
      valueLabels: {
        "full-enrichment": "Full Enrichment",
        "cached-risk-scores": "Cached Risk Scores",
        disabled: "Disabled",
      },
    },
    {
      key: PRIVILEGED_ACTION_MODE_KEY,
      label: "Privileged Action Mode",
      componentId: "auth-orchestrator",
      valueLabels: {
        protected: "Protected",
        "temporarily-unavailable": "Temporarily Unavailable",
        "allow-with-cached-risk": "Allow With Cached Risk",
      },
    },
    {
      key: MFA_RETRY_BACKOFF_KEY,
      label: "MFA Retry Backoff",
      componentId: "mfa-provider",
      valueLabels: {
        aggressive: "Aggressive",
        backoff: "Backoff",
        "disabled-retry": "Disabled",
      },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "auth-orchestrator", label: "Authentication Orchestrator" },
    { id: "session-store", label: "Session Store" },
    { id: "token-verification", label: "Token Verification" },
    { id: "mfa-provider", label: "MFA Provider" },
    { id: "risk-engine", label: "Risk Engine" },
    { id: "user-directory", label: "User Directory" },
  ],
};
