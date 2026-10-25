import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  ABUSE_TRAFFIC_BLOCK_KEY,
  DETECTION_RULE_VERSION_KEY,
  FALSE_POSITIVE_EXEMPTION_KEY,
  IDENTITY_TRUST_SCORING_KEY,
  RATE_LIMITER_MODE_KEY,
} from "./controls";

export const abusePreventionFalsePositiveStormCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "legitimateUserSuccessRate", label: "Legitimate User Success Rate", sourceStateKey: "legitimateUserSuccessRate", format: "percentage" },
    { key: "legitimateUsersBlockedCount", label: "Legitimate Users Blocked (Current)", sourceStateKey: "legitimateUsersBlockedCount", format: "number" },
    { key: "abuseRequestsAllowedRate", label: "Abuse Requests Allowed Rate", sourceStateKey: "abuseRequestsAllowedRate", format: "percentage" },
    { key: "cumulativeAbuseRequestsAllowedCount", label: "Abuse Requests Allowed (Cumulative)", sourceStateKey: "cumulativeAbuseRequestsAllowedCount", format: "number" },
    { key: "detectionRuleStatus", label: "Detection Rule Status", sourceStateKey: "detectionRuleStatus", format: "status" },
    { key: "rateLimiterStatus", label: "Rate Limiter Status", sourceStateKey: "rateLimiterStatus", format: "status" },
    { key: "abuseProtectionStatus", label: "Abuse Protection Status", sourceStateKey: "abuseProtectionStatus", format: "status" },
  ],
  controls: [
    {
      key: DETECTION_RULE_VERSION_KEY,
      label: "Detection Rule Version",
      componentId: "abuse-detection",
      valueLabels: { "v2-bad": "v2 (Faulty)", "v1-stable": "v1 (Rollback)", "v3-patched": "v3 (Patched)" },
    },
    {
      key: RATE_LIMITER_MODE_KEY,
      label: "Rate Limiter Mode",
      componentId: "rate-limiter",
      valueLabels: { strict: "Strict", relaxed: "Relaxed", disabled: "Disabled" },
    },
    {
      key: FALSE_POSITIVE_EXEMPTION_KEY,
      label: "False-Positive Exemption",
      componentId: "abuse-detection",
      valueLabels: { none: "None", "exempt-flagged-legit": "Exempt Flagged-Legit Users" },
    },
    {
      key: ABUSE_TRAFFIC_BLOCK_KEY,
      label: "Abuse Traffic Block",
      componentId: "rate-limiter",
      valueLabels: { active: "Active", inactive: "Inactive" },
    },
    {
      key: IDENTITY_TRUST_SCORING_KEY,
      label: "Identity Trust Scoring",
      componentId: "identity",
      valueLabels: { enabled: "Enabled", disabled: "Disabled" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "edge", label: "Edge" },
    { id: "abuse-detection", label: "Abuse Detection" },
    { id: "rate-limiter", label: "Rate Limiter" },
    { id: "identity", label: "Identity" },
    { id: "core-api", label: "Core API" },
  ],
};
