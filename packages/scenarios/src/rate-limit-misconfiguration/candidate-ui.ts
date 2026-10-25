import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BURST_SIZE_KEY,
  EMERGENCY_BYPASS_KEY,
  GLOBAL_QUOTA_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  RATE_LIMIT_POLICY_KEY,
} from "./controls";

export const rateLimitMisconfigurationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "rejectionRate", label: "429 Rate", sourceStateKey: "rejectionRate", format: "percentage" },
    {
      key: "legitimateTenantSuccessRate",
      label: "Legitimate Tenant Success",
      sourceStateKey: "legitimateTenantSuccessRate",
      format: "percentage",
    },
    {
      key: "bursterShareOfCapacity",
      label: "Top Tenant's Share of Capacity",
      sourceStateKey: "bursterShareOfCapacity",
      format: "percentage",
    },
    {
      key: "backendUtilization",
      label: "Backend Utilization",
      sourceStateKey: "backendUtilization",
      format: "percentage",
    },
    {
      key: "limiterBucketUtilization",
      label: "Limiter Bucket Utilization",
      sourceStateKey: "limiterBucketUtilization",
      format: "percentage",
    },
    {
      key: "customerSuccessRate",
      label: "Customer Success Rate",
      sourceStateKey: "customerSuccessRate",
      format: "percentage",
    },
  ],
  controls: [
    {
      key: RATE_LIMIT_POLICY_KEY,
      label: "Rate-Limit Policy",
      componentId: "api-gateway",
      valueLabels: {
        "newly-deployed": "Newly Deployed",
        retuned: "Retuned",
        "previous-policy": "Previous Policy",
      },
    },
    {
      key: BURST_SIZE_KEY,
      label: "Burst Size",
      componentId: "api-gateway",
    },
    {
      key: PER_TENANT_QUOTA_KEY,
      label: "Per-Tenant Quota (req/min)",
      componentId: "api-gateway",
    },
    {
      key: GLOBAL_QUOTA_KEY,
      label: "Global Quota (req/min)",
      componentId: "api-gateway",
    },
    {
      key: PRIORITY_CLASS_KEY,
      label: "Priority Class",
      componentId: "api-gateway",
      valueLabels: { none: "None", "favor-steady": "Favor Steady Tenants" },
    },
    {
      key: EMERGENCY_BYPASS_KEY,
      label: "Emergency Bypass",
      componentId: "api-gateway",
      valueLabels: { false: "Off", true: "Engaged" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "services", label: "Services" },
  ],
};
