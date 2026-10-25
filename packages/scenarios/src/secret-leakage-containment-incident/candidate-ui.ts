import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  AUDIT_LOG_REVIEW_KEY,
  DEPENDENT_COHORT_MIGRATION_KEY,
  EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
  INVESTIGATION_STATUS_KEY,
  MISUSE_MONITORING_KEY,
  NEW_CREDENTIAL_ISSUED_KEY,
  REVOCATION_SCOPE_KEY,
} from "./controls";

export const secretLeakageContainmentIncidentCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "applicationRequestSuccessRate", label: "Application Request Success Rate", sourceStateKey: "applicationRequestSuccessRate", format: "percentage" },
    { key: "externalIntegrationSuccessRate", label: "External Integration Success Rate", sourceStateKey: "externalIntegrationSuccessRate", format: "percentage" },
    { key: "externalIntegrationStatus", label: "External Integration Status", sourceStateKey: "externalIntegrationStatus", format: "status" },
    { key: "blastRadiusStatus", label: "Blast Radius Status", sourceStateKey: "blastRadiusStatus", format: "status" },
    { key: "migratedCohortCount", label: "Dependent Cohorts Migrated", sourceStateKey: "migratedCohortCount", format: "number" },
    { key: "suspectedExposedCredentialUseCount", label: "Suspected Exposed-Credential Uses (Cumulative)", sourceStateKey: "suspectedExposedCredentialUseCount", format: "number" },
    { key: "credentialContainmentStatus", label: "Credential Containment Status", sourceStateKey: "credentialContainmentStatus", format: "status" },
    { key: "auditReviewStatus", label: "Audit Review Status", sourceStateKey: "auditReviewStatus", format: "status" },
  ],
  controls: [
    {
      key: EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
      label: "Exposed Credential Trust Mode",
      componentId: "secret-manager",
      valueLabels: {
        "fully-trusted": "Fully Trusted",
        monitored: "Monitored",
        revoked: "Revoked",
      },
    },
    {
      key: INVESTIGATION_STATUS_KEY,
      label: "Investigation Status",
      componentId: "logging",
      valueLabels: { "not-started": "Not Started", "scope-identified": "Scope Identified" },
    },
    {
      key: REVOCATION_SCOPE_KEY,
      label: "Revocation Scope",
      componentId: "secret-manager",
      valueLabels: {
        none: "None",
        "cohort-staged": "Cohort-Staged",
        "broad-immediate": "Broad Immediate",
      },
    },
    {
      key: NEW_CREDENTIAL_ISSUED_KEY,
      label: "New Credential Issued",
      componentId: "secret-manager",
      valueLabels: { false: "Not Issued", true: "Issued" },
    },
    {
      key: DEPENDENT_COHORT_MIGRATION_KEY,
      label: "Dependent Cohort Migration",
      componentId: "applications",
      valueLabels: {
        none: "None Migrated",
        "cohort-a-migrated": "Cohort A Migrated",
        "cohort-a-and-b-migrated": "Cohort A & B Migrated",
      },
    },
    {
      key: MISUSE_MONITORING_KEY,
      label: "Misuse Monitoring",
      componentId: "logging",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: AUDIT_LOG_REVIEW_KEY,
      label: "Audit Log Review",
      componentId: "ci-cd",
      valueLabels: { false: "Not Completed", true: "Completed" },
    },
  ],
  components: [
    { id: "applications", label: "Applications" },
    { id: "secret-manager", label: "Secret Manager" },
    { id: "ci-cd", label: "CI/CD" },
    { id: "logging", label: "Logging" },
    { id: "external-integrations", label: "External Integrations" },
  ],
};
