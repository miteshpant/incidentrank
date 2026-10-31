import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CORS_ALLOWED_ORIGINS_MODE_KEY,
  INSPECT_CORS_POLICY_DIFF_KEY,
  INSPECT_PARTNER_ERROR_LOGS_KEY,
  INSPECT_PREFLIGHT_RESPONSES_KEY,
  RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
  ROTATE_PARTNER_API_KEYS_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const corsMisconfigurationBlocksPartnersCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "internalWebAppErrorRatePercent",
      label: "Internal Web App Error Rate",
      sourceStateKey: "internalWebAppErrorRatePercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "partnerCorsPreflightRejectionRatePercent",
      label: "Partner CORS Preflight Rejection Rate",
      sourceStateKey: "partnerCorsPreflightRejectionRatePercent",
      format: "percentage",
      roleInIncident: "root_cause",
    },
    {
      key: "partnerApiErrorRatePercent",
      label: "Partner API Error Rate",
      sourceStateKey: "partnerApiErrorRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "partnerIntegrationRequestVolumePercent",
      label: "Partner Integration Request Volume",
      sourceStateKey: "partnerIntegrationRequestVolumePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "cdnCacheHitRatePercent",
      label: "CDN Cache Hit Rate",
      sourceStateKey: "cdnCacheHitRatePercent",
      format: "percentage",
      roleInIncident: "noise",
    },
    {
      key: "corsPolicyStatus",
      label: "CORS Policy Status",
      sourceStateKey: "corsPolicyStatus",
      format: "status",
      roleInIncident: "contributing_factor",
    },
  ],
  controls: [
    {
      key: INSPECT_CORS_POLICY_DIFF_KEY,
      label: "Inspect CORS Policy Diff",
      componentId: "cors-policy-enforcer",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_PARTNER_ERROR_LOGS_KEY,
      label: "Inspect Partner Error Logs",
      componentId: "partner-integration-service",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_PREFLIGHT_RESPONSES_KEY,
      label: "Inspect Browser Preflight Responses",
      componentId: "partner-api-gateway",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: CORS_ALLOWED_ORIGINS_MODE_KEY,
      label: "CORS Allowed Origins Mode",
      componentId: "cors-policy-enforcer",
      kind: "remediation",
      valueLabels: {
        "strict-internal-only": "Strict (internal only)",
        "allowlist-partners": "Allowlist partner origins",
        "wildcard-open": "Wildcard (allow any origin)",
      },
    },
    {
      key: ROTATE_PARTNER_API_KEYS_KEY,
      label: "Rotate Partner API Keys",
      componentId: "partner-integration-service",
      kind: "remediation",
      valueLabels: { false: "Not rotated", true: "Rotated" },
    },
    {
      key: RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
      label: "Restart Partner Integration Service",
      componentId: "partner-integration-service",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
  ],
  components: [
    { id: "internal-web-app", label: "Internal Web App" },
    { id: "partner-api-gateway", label: "Partner API Gateway" },
    { id: "cors-policy-enforcer", label: "CORS Policy Enforcer" },
    { id: "partner-integration-service", label: "Partner Integration Service" },
  ],
};
