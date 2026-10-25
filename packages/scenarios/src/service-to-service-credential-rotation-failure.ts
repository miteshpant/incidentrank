import type { ScenarioDefinition } from "./types";
import {
  serviceToServiceCredentialRotationFailureSimulation,
  CREDENTIAL_VALIDATION_MODE_KEY,
  NEW_CREDENTIAL_ACTIVATION_KEY,
  OLD_CREDENTIAL_VALIDITY_KEY,
  ROLLBACK_OLD_CREDENTIAL_KEY,
  ROTATION_COHORT_STAGE_KEY,
} from "./service-to-service-credential-rotation-failure/definition";
import { serviceToServiceCredentialRotationFailureCandidateUI } from "./service-to-service-credential-rotation-failure/candidate-ui";
import { SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING } from "./service-to-service-credential-rotation-failure/scoring";

/**
 * Service-to-Service Credential Rotation Failure — a paid, Senior-Staff
 * IncidentRank scenario (docs/implementation_plan/phase-6e-strategy-
 * spec.md, scenario 82). A routine service-to-service credential
 * rotation is in progress: Service B calls Service C, authenticating
 * with a credential minted by the Certificate/Token Issuer and fetched
 * through the Secret Manager. A subset of Service B's workloads may
 * still be presenting the old credential at any given moment while the
 * new one is phased in — this overlapping validity is the scenario's
 * safe mechanism, not a risk to eliminate early. The real danger is
 * entirely self-inflicted sequencing: revoking the old credential
 * before every workload cohort has verified adoption of the new one.
 */
export const serviceToServiceCredentialRotationFailure: ScenarioDefinition = {
  id: "service-to-service-credential-rotation-failure",
  slug: "service-to-service-credential-rotation-failure",
  version: 1,
  name: "Service-to-Service Credential Rotation Failure",
  description:
    "A routine service-to-service credential rotation is in progress between Service A, Service B, Service C, the Secret Manager, and the Certificate/Token Issuer. Four business invariants govern every decision here: (1) service-to-service calls must remain authenticated throughout the rotation — a credential gap must never be bridged by disabling authentication; (2) old and new credentials may overlap in validity for a bounded window — this is the safe mechanism this rotation is built around, not a risk to eliminate early; (3) revoking the old credential before all workloads have confirmed rotation creates a real outage, not just a security exposure; (4) rotation cohorts may be staged — broad instant rotation across every workload simultaneously is not required and is not necessarily safer. The scenario's required security invariant: a revoked credential must never be silently re-accepted merely to restore connectivity — if revocation was premature, the fix is re-extending validity deliberately and auditably, never bypassing credential validation. Decide how to sequence activation of the new credential, how to stage and verify cohort adoption before revoking anything, and — if a premature revocation gap is ever created — whether to close it the sanctioned way or reach for the tempting but forbidden broad authentication bypass.",
  difficulty: "senior_staff",
  estimatedMinutes: 20,
  isFree: false,
  simulation: serviceToServiceCredentialRotationFailureSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Credential Rotation",
      "Authentication",
      "Sequencing",
      "Blast Radius",
      "Historical Damage",
      "Security Correctness",
    ],
    skills: [
      "Staging credential rotation cohorts and verifying adoption before revocation",
      "Recognizing broad authentication bypass as an availability/security tradeoff trap",
      "Sequencing activation -> staged verification -> revocation correctly",
      "Choosing a deliberate, auditable rollback over a disabled-validation shortcut",
    ],
    shortDescription:
      "A service-to-service credential rotation goes wrong when the old credential is revoked before every workload cohort has adopted the new one — disabling authentication fixes availability but creates a permanent authentication-bypass violation.",
  },
};

export {
  serviceToServiceCredentialRotationFailureSimulation,
  serviceToServiceCredentialRotationFailureCandidateUI,
  SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
  CREDENTIAL_VALIDATION_MODE_KEY,
  NEW_CREDENTIAL_ACTIVATION_KEY,
  OLD_CREDENTIAL_VALIDITY_KEY,
  ROLLBACK_OLD_CREDENTIAL_KEY,
  ROTATION_COHORT_STAGE_KEY,
};
