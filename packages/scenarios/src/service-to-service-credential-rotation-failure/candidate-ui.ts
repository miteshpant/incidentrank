import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CREDENTIAL_VALIDATION_MODE_KEY,
  NEW_CREDENTIAL_ACTIVATION_KEY,
  OLD_CREDENTIAL_VALIDITY_KEY,
  ROLLBACK_OLD_CREDENTIAL_KEY,
  ROTATION_COHORT_STAGE_KEY,
} from "./controls";

export const serviceToServiceCredentialRotationFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "serviceToServiceCallSuccessRate", label: "Service-to-Service Call Success Rate", sourceStateKey: "serviceToServiceCallSuccessRate", format: "percentage" },
    { key: "authenticationFailureRatePercent", label: "Authentication Failure Rate", sourceStateKey: "authenticationFailureRatePercent", format: "percentage" },
    { key: "genuinelyAuthenticatedCallPercent", label: "Genuinely Authenticated Calls", sourceStateKey: "genuinelyAuthenticatedCallPercent", format: "percentage" },
    { key: "newCredentialAdoptionPercent", label: "New Credential Adoption", sourceStateKey: "newCredentialAdoptionPercent", format: "percentage" },
    { key: "rotationSafetyStatus", label: "Rotation Safety Status", sourceStateKey: "rotationSafetyStatus", format: "status" },
    { key: "cumulativeUnauthenticatedCallCount", label: "Cumulative Unauthenticated Calls (historical)", sourceStateKey: "cumulativeUnauthenticatedCallCount", format: "number" },
  ],
  controls: [
    {
      key: NEW_CREDENTIAL_ACTIVATION_KEY,
      label: "New Credential Activation",
      componentId: "service-c",
      valueLabels: { false: "Not Active", true: "Active" },
    },
    {
      key: ROTATION_COHORT_STAGE_KEY,
      label: "Rotation Cohort Stage",
      componentId: "service-b",
      valueLabels: {
        "not-started": "Not Started",
        "cohort-1-verified": "Cohort 1 Verified",
        "cohort-2-verified": "Cohort 2 Verified",
        "all-cohorts-verified": "All Cohorts Verified",
      },
    },
    {
      key: OLD_CREDENTIAL_VALIDITY_KEY,
      label: "Old Credential Validity",
      componentId: "secret-manager",
      valueLabels: { valid: "Valid", revoked: "Revoked" },
    },
    {
      key: ROLLBACK_OLD_CREDENTIAL_KEY,
      label: "Rollback Old Credential Validity",
      componentId: "secret-manager",
      valueLabels: { false: "Not Issued", true: "Issued (re-extended)" },
    },
    {
      key: CREDENTIAL_VALIDATION_MODE_KEY,
      label: "Credential Validation Mode",
      componentId: "service-c",
      valueLabels: { enforced: "Enforced", "disabled-temporarily": "Disabled (Temporarily)" },
    },
  ],
  components: [
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "service-c", label: "Service C" },
    { id: "secret-manager", label: "Secret Manager" },
    { id: "cert-token-issuer", label: "Certificate / Token Issuer" },
  ],
};
