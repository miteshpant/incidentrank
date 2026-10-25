import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CACHE_INVALIDATION_KEY,
  EMERGENCY_OVERRIDE_LIST_KEY,
  FAIL_OPEN_MODE_KEY,
  POLICY_CACHE_TTL_SECONDS_KEY,
  POLICY_VERSION_PIN_KEY,
  ROLLBACK_SOURCE_POLICY_KEY,
  ROLLOUT_FREEZE_KEY,
  STAGED_COHORT_KEY,
} from "./controls";

export const authorizationPolicyRolloutFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestSuccessRate", label: "Request Success Rate", sourceStateKey: "requestSuccessRate", format: "percentage" },
    { key: "falseDenyRatePercent", label: "False-Deny Rate", sourceStateKey: "falseDenyRatePercent", format: "percentage" },
    { key: "unauthorizedGrantRatePercent", label: "Unauthorized Grant Rate", sourceStateKey: "unauthorizedGrantRatePercent", format: "percentage" },
    { key: "rolloutPolicyVersion", label: "Rollout Policy Version", sourceStateKey: "rolloutPolicyVersion", format: "status" },
    { key: "cacheConvergencePercent", label: "Fleet Cache Convergence", sourceStateKey: "cacheConvergencePercent", format: "percentage" },
    { key: "fleetVersionSkewStatus", label: "Fleet Version Skew", sourceStateKey: "fleetVersionSkewStatus", format: "status" },
    { key: "cumulativeUnauthorizedAccessCount", label: "Cumulative Unauthorized Access (historical)", sourceStateKey: "cumulativeUnauthorizedAccessCount", format: "number" },
    { key: "enforcementPosture", label: "Enforcement Posture", sourceStateKey: "enforcementPosture", format: "status" },
    { key: "authorizationStatus", label: "Authorization Status", sourceStateKey: "authorizationStatus", format: "status" },
  ],
  controls: [
    {
      key: ROLLOUT_FREEZE_KEY,
      label: "Rollout Freeze",
      componentId: "policy-rollout",
      valueLabels: { rolling: "Rolling", frozen: "Frozen" },
    },
    {
      key: POLICY_VERSION_PIN_KEY,
      label: "Policy Version Pin",
      componentId: "policy-rollout",
      valueLabels: { "v2-bad": "v2 (regressed)", "v1-pinned-good": "v1 (pinned, known-good)" },
    },
    {
      key: ROLLBACK_SOURCE_POLICY_KEY,
      label: "Rollback Source Policy",
      componentId: "policy-store",
      valueLabels: { false: "Not rolled back", true: "Rolled back to known-good" },
    },
    {
      key: CACHE_INVALIDATION_KEY,
      label: "Cache Invalidation",
      componentId: "policy-decision-point",
      valueLabels: { idle: "Idle", invalidating: "Invalidating" },
    },
    {
      key: FAIL_OPEN_MODE_KEY,
      label: "Fail-Open / Fail-Closed Mode",
      componentId: "policy-decision-point",
      valueLabels: {
        "fail-closed-all": "Fail-Closed (all resources)",
        "fail-open-noncritical": "Fail-Open (non-critical only)",
        "fail-open-all": "Fail-Open (all resources)",
      },
    },
    {
      key: POLICY_CACHE_TTL_SECONDS_KEY,
      label: "Policy Cache TTL",
      componentId: "policy-decision-point",
      valueLabels: { "30": "30 seconds", "300": "300 seconds" },
    },
    {
      key: STAGED_COHORT_KEY,
      label: "Rollout Cohort",
      componentId: "policy-rollout",
      valueLabels: { all: "All", "staged-canary": "Staged Canary" },
    },
    {
      key: EMERGENCY_OVERRIDE_LIST_KEY,
      label: "Emergency Override List",
      componentId: "api-gateway",
      valueLabels: {
        none: "None",
        "deny-high-risk": "Emergency Deny (high-risk)",
        "allow-affected-cohort": "Emergency Allow (affected cohort)",
      },
    },
  ],
  components: [
    { id: "requests", label: "Requests" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "policy-decision-point", label: "Policy Decision Point" },
    { id: "policy-store", label: "Policy Store" },
    { id: "identity-context", label: "Identity Context" },
    { id: "resource-metadata", label: "Resource Metadata" },
    { id: "policy-rollout", label: "Policy Rollout / Cache Distribution" },
  ],
};
