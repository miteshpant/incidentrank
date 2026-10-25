import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CERTIFICATE_OVERLAP_WINDOW_KEY,
  COHORT_ROLLOUT_STAGE_KEY,
  LEGACY_COMPATIBILITY_BRIDGE_KEY,
  LOAD_BALANCER_CERTIFICATE_MODE_KEY,
  OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
  ROTATION_ORDER_KEY,
  TRUST_BUNDLE_UPDATE_STATUS_KEY,
} from "./controls";

export const certificateExpiryAcrossLargeFleetCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "loadBalancerConnectionSuccessRatePercent", label: "Load Balancer Connection Success Rate", sourceStateKey: "loadBalancerConnectionSuccessRatePercent", format: "percentage" },
    { key: "modernCohortDaysToExpiry", label: "Modern Cohort — Days to Expiry", sourceStateKey: "modernCohortDaysToExpiry", format: "number" },
    { key: "criticalCohortDaysToExpiry", label: "Critical Cohort — Days to Expiry", sourceStateKey: "criticalCohortDaysToExpiry", format: "number" },
    { key: "legacyCohortDaysToExpiry", label: "Legacy Cohort — Days to Expiry", sourceStateKey: "legacyCohortDaysToExpiry", format: "number" },
    { key: "modernCohortRotationStatus", label: "Modern Cohort Rotation Status", sourceStateKey: "modernCohortRotationStatus", format: "status" },
    { key: "criticalCohortRotationStatus", label: "Critical Cohort Rotation Status", sourceStateKey: "criticalCohortRotationStatus", format: "status" },
    { key: "legacyCohortRotationStatus", label: "Legacy Cohort Rotation Status", sourceStateKey: "legacyCohortRotationStatus", format: "status" },
    { key: "fleetConnectionStatus", label: "Fleet Connection Status", sourceStateKey: "fleetConnectionStatus", format: "status" },
    { key: "cumulativeRejectedConnectionCount", label: "Rejected Connections (cumulative)", sourceStateKey: "cumulativeRejectedConnectionCount", format: "number" },
    { key: "cumulativeValidationBypassedConnectionCount", label: "Validation-Bypassed Connections (cumulative)", sourceStateKey: "cumulativeValidationBypassedConnectionCount", format: "number" },
    { key: "legacyTrustBundleVerifiedStatus", label: "Legacy Trust Bundle Status", sourceStateKey: "legacyTrustBundleVerifiedStatus", format: "status" },
  ],
  controls: [
    {
      key: ROTATION_ORDER_KEY,
      label: "Rotation Order",
      componentId: "service-fleet",
      valueLabels: { "modern-first": "Modern Cohort First", "critical-first": "Critical Cohort First" },
    },
    {
      key: CERTIFICATE_OVERLAP_WINDOW_KEY,
      label: "Certificate Overlap Window",
      componentId: "certificate-authority",
      valueLabels: { closed: "Closed (no overlap)", open: "Open (old + new both trusted)" },
    },
    {
      key: COHORT_ROLLOUT_STAGE_KEY,
      label: "Cohort Rollout Stage",
      componentId: "service-fleet",
      valueLabels: {
        "not-started": "Not Started",
        "modern-rotated": "Modern Rotated",
        "critical-rotated": "Critical Rotated",
        "legacy-bridged": "Legacy Bridged",
        "all-cohorts-rotated": "All Cohorts Rotated",
      },
    },
    {
      key: LEGACY_COMPATIBILITY_BRIDGE_KEY,
      label: "Legacy Compatibility Bridge",
      componentId: "external-clients",
      valueLabels: { off: "Off", on: "On (extended overlap for Legacy)" },
    },
    {
      key: TRUST_BUNDLE_UPDATE_STATUS_KEY,
      label: "Trust Bundle Update Status",
      componentId: "external-clients",
      valueLabels: { pending: "Pending", "updated-and-verified": "Updated and Verified" },
    },
    {
      key: OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
      label: "Old Certificate Revocation",
      componentId: "certificate-authority",
      valueLabels: { "not-revoked": "Not Revoked", revoked: "Revoked" },
    },
    {
      key: LOAD_BALANCER_CERTIFICATE_MODE_KEY,
      label: "Load Balancer Certificate Mode",
      componentId: "load-balancers",
      valueLabels: { "standard-validation": "Standard Validation", "validation-bypass-all": "Bypass All Validation" },
    },
  ],
  components: [
    { id: "certificate-authority", label: "Certificate Authority" },
    { id: "secret-distribution", label: "Secret Distribution" },
    { id: "service-fleet", label: "Service Fleet" },
    { id: "load-balancers", label: "Load Balancers" },
    { id: "external-clients", label: "External Clients" },
  ],
};
