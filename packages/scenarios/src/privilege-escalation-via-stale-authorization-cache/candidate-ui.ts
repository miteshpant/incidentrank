import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CACHE_INVALIDATION_MODE_KEY,
  CACHE_PURGE_SCOPE_KEY,
  CACHE_TTL_SECONDS_KEY,
  CONVERGENCE_UNCERTAINTY_MODE_KEY,
  CONVERGENCE_VERIFICATION_KEY,
  POLICY_STORE_READ_MODE_KEY,
} from "./controls";

export const privilegeEscalationViaStaleAuthorizationCacheCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestSuccessRate", label: "Request Success Rate", sourceStateKey: "requestSuccessRate", format: "percentage" },
    { key: "correctDenyRatePercent", label: "Correct Deny Rate", sourceStateKey: "correctDenyRatePercent", format: "percentage" },
    { key: "staleGrantRatePercent", label: "Stale Grant Rate", sourceStateKey: "staleGrantRatePercent", format: "percentage" },
    { key: "cacheConvergencePercent", label: "Fleet Cache Convergence", sourceStateKey: "cacheConvergencePercent", format: "percentage" },
    { key: "fleetCacheConvergenceStatus", label: "Fleet Convergence Status", sourceStateKey: "fleetCacheConvergenceStatus", format: "status" },
    { key: "cumulativeStalePrivilegeGrantCount", label: "Cumulative Stale Privilege Grants (historical)", sourceStateKey: "cumulativeStalePrivilegeGrantCount", format: "number" },
    { key: "enforcementPosture", label: "Enforcement Posture", sourceStateKey: "enforcementPosture", format: "status" },
    { key: "authorizationStatus", label: "Authorization Status", sourceStateKey: "authorizationStatus", format: "status" },
  ],
  controls: [
    {
      key: CACHE_INVALIDATION_MODE_KEY,
      label: "Cache Invalidation Mode",
      componentId: "policy-store",
      valueLabels: { lazy: "Lazy (TTL-only)", immediate: "Immediate Push", forced: "Forced Fleet Re-sync" },
    },
    {
      key: CONVERGENCE_UNCERTAINTY_MODE_KEY,
      label: "Convergence Uncertainty Mode",
      componentId: "authorization-layer",
      valueLabels: { "fail-closed": "Fail-Closed (deny if unverified)", "fail-open": "Fail-Open (trust any cache)" },
    },
    {
      key: CACHE_TTL_SECONDS_KEY,
      label: "Cache TTL",
      componentId: "cache-distribution",
      valueLabels: { "600": "600 seconds", "120": "120 seconds", "30": "30 seconds" },
    },
    {
      key: CONVERGENCE_VERIFICATION_KEY,
      label: "Convergence Verification",
      componentId: "authorization-layer",
      valueLabels: { unverified: "Unverified (assumed)", "verify-before-trust": "Verify Before Trust" },
    },
    {
      key: CACHE_PURGE_SCOPE_KEY,
      label: "Cache Purge Scope",
      componentId: "cache-distribution",
      valueLabels: { none: "None", targeted: "Targeted (affected privilege only)", "broad-trust-all": "Broad Trust-All Flush" },
    },
    {
      key: POLICY_STORE_READ_MODE_KEY,
      label: "Policy Store Read Mode",
      componentId: "policy-store",
      valueLabels: { "cached-ok": "Cached OK", "source-of-truth-required": "Source-of-Truth Required" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "authorization-layer", label: "Authorization Layer" },
    { id: "policy-store", label: "Policy Store" },
    { id: "resource-metadata", label: "Resource Metadata" },
    { id: "cache-distribution", label: "Cache Distribution" },
  ],
};
