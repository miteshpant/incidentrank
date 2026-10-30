import type { ScenarioDefinition } from "./types";
import {
  secretLeakageContainmentIncidentSimulation,
  AUDIT_LOG_REVIEW_KEY,
  DEPENDENT_COHORT_MIGRATION_KEY,
  EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
  INVESTIGATION_STATUS_KEY,
  MISUSE_MONITORING_KEY,
  NEW_CREDENTIAL_ISSUED_KEY,
  REVOCATION_SCOPE_KEY,
} from "./secret-leakage-containment-incident/definition";
import { secretLeakageContainmentIncidentCandidateUI } from "./secret-leakage-containment-incident/candidate-ui";
import { SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING } from "./secret-leakage-containment-incident/scoring";

/**
 * Secret Leakage Containment Incident — a paid, Principal-level
 * IncidentRank scenario (docs/implementation_plan/phase-6e-strategy-spec.md,
 * scenario 85). A credential used by Applications and External
 * Integrations has been found in plaintext in a Logging record and in
 * a CI/CD build artifact — it must now be treated as believed-exposed.
 * The system is otherwise completely healthy: there is no outage, no
 * scaling problem, and no capacity pressure anywhere in this incident.
 * The only problem is risk, and risk does not show up on an
 * availability dashboard.
 *
 * Four business invariants govern every decision here: (1) a
 * believed-exposed credential's blast radius must be understood —
 * which systems and integrations actually use it — before broad
 * revocation, but investigation must not become an excuse to delay
 * containment indefinitely; (2) revoking a credential that a critical,
 * not-yet-migrated integration still relies on, without a replacement
 * in place, creates a real, avoidable outage — this must be sequenced,
 * not instant; (3) every use of the exposed credential after exposure
 * was identified must be recorded as an auditable historical fact,
 * whether or not it was ultimately malicious; (4) containment —
 * narrowing scope, rotating to a new credential, monitoring for misuse
 * — is preferred over broad, simultaneous revocation without a
 * sequenced replacement plan. A single, explicit security invariant
 * sits above all four: once a credential is believed exposed,
 * continuing to treat it as fully trusted — taking no containment
 * action at all — is never acceptable, regardless of how disruptive
 * rotation might be to dependent systems. Doing nothing looks
 * completely safe on every availability metric while a real,
 * permanent, non-resetting count of suspected exposed-credential uses
 * accrues in the background. The opposite shortcut — revoking the
 * credential broadly and immediately, before any dependent-system
 * cohort has migrated to a replacement — fixes the security exposure
 * instantly but breaks every not-yet-migrated integration at once, a
 * real and entirely avoidable outage. The safe path narrows trust and
 * turns on monitoring first, issues a clean replacement credential,
 * stages rotation cohort by cohort as each one genuinely migrates, and
 * only then fully revokes the old credential — while a separate
 * historical audit review closes out exactly what happened during the
 * exposure window, a step live monitoring alone can never supply
 * retroactively.
 */
export const secretLeakageContainmentIncident: ScenarioDefinition = {
  id: "secret-leakage-containment-incident",
  slug: "secret-leakage-containment-incident",
  version: 1,
  name: "Secret Leakage Containment Incident",
  description:
    "A credential used by Applications and External Integrations has been found in plaintext in a Logging record and in a CI/CD build artifact — it must now be treated as believed-exposed. The system is otherwise completely healthy: there is no outage, no scaling problem, and no capacity pressure anywhere in this incident. The only problem is risk, and risk does not show up on an availability dashboard. Four business invariants govern every decision here: (1) a believed-exposed credential's blast radius must be understood — which systems and integrations actually use it — before broad revocation, but investigation must not become an excuse to delay containment indefinitely; (2) revoking a credential that is still relied on by a critical, not-yet-migrated integration, without a replacement in place, creates a real, avoidable outage — this must be sequenced, not instant; (3) every use of the exposed credential after exposure was identified must be recorded as an auditable historical fact, whether or not it was ultimately malicious; (4) containment — narrowing scope, rotating to a new credential, monitoring for misuse — is preferred over broad, simultaneous revocation without a sequenced replacement plan. This incident's central security invariant sits above all four: once a credential is believed exposed, continuing to treat it as fully trusted, taking no containment action at all, is never acceptable, regardless of how disruptive rotation might be to dependent systems. Doing nothing looks completely safe on every availability metric while a real, permanent, non-resetting count of suspected exposed-credential uses accrues in the background. The opposite shortcut — revoking the credential broadly and immediately, before any dependent-system cohort has migrated to a replacement — fixes the security exposure instantly but breaks every not-yet-migrated integration at once, a real and entirely avoidable outage. Decide how to narrow trust and monitor for misuse while blast radius is confirmed, how to sequence cohort-by-cohort migration to a new credential before fully revoking the old one, and what historical review is required before this incident can honestly be called closed.",
  difficulty: "principal",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: secretLeakageContainmentIncidentSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Secrets Management",
      "Incident Response",
      "Containment Sequencing",
      "Credential Rotation",
      "Auditability",
      "Historical Damage",
    ],
    skills: [
      "Treating a believed credential exposure as an active incident rather than a metrics problem",
      "Sequencing containment (narrow/monitor) before broad, irreversible revocation",
      "Staging credential rotation by dependent-system cohort instead of acting on everyone at once",
      "Recognizing that an available-looking 'do nothing' path still creates permanent security damage",
    ],
    shortDescription:
      "A credential is found exposed in logs and a CI/CD artifact — doing nothing is invisible but unsafe, and revoking it broadly breaks production.",
  },
};

export {
  secretLeakageContainmentIncidentSimulation,
  secretLeakageContainmentIncidentCandidateUI,
  SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING,
  AUDIT_LOG_REVIEW_KEY,
  DEPENDENT_COHORT_MIGRATION_KEY,
  EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
  INVESTIGATION_STATUS_KEY,
  MISUSE_MONITORING_KEY,
  NEW_CREDENTIAL_ISSUED_KEY,
  REVOCATION_SCOPE_KEY,
};
