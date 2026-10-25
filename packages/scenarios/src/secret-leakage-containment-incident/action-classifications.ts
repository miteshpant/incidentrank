import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  AUDIT_LOG_REVIEW_KEY,
  DEPENDENT_COHORT_MIGRATION_KEY,
  EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
  INVESTIGATION_STATUS_KEY,
  MISUSE_MONITORING_KEY,
  NEW_CREDENTIAL_ISSUED_KEY,
  REVOCATION_SCOPE_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── exposedCredentialTrustMode ───────────────────────────────────
  {
    id: "acr_1",
    controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
    valueEquals: "fully-trusted",
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "harmful",
    feedback: {
      title: "Continuing to trust the exposed credential left a real exposure window open",
      explanation:
        "Leaving the exposed credential fully trusted after exposure was identified made no application or integration metric look any worse — this is exactly why it is tempting. But it directly violates the invariant that a believed-exposed credential can never continue to be treated as fully trusted. Every tick this stayed active added to a permanent, non-resetting count of suspected uses of the exposed credential, which stays on the record even after it is later contained, and this path can never resolve the incident at any tier.",
    },
  },
  {
    id: "acr_2",
    controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
    valueEquals: "monitored",
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "beneficial",
    feedback: {
      title: "Moving to monitored containment stopped new historical exposure risk from accruing",
      explanation:
        "Switching the exposed credential to a monitored posture (paired with active misuse monitoring) stops the permanent exposure counter from climbing further and buys time to identify blast radius and stage a safe rotation — a real, bounded first response rather than an indefinite excuse to delay containment.",
    },
  },
  {
    id: "acr_3",
    controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
    valueEquals: "revoked",
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "neutral",
    feedback: {
      title: "Revoking the credential is only as safe as its sequencing",
      explanation:
        "Deciding to revoke the exposed credential is the right eventual goal, but whether this is safe depends entirely on revocationScope and how many dependent-system cohorts have genuinely migrated to a replacement first — revoking broadly before any cohort has migrated breaks real production dependencies; revoking only for already-migrated cohorts (cohort-staged) does not.",
    },
  },

  // ── revocationScope ──────────────────────────────────────────────
  {
    id: "acr_4",
    controlKey: REVOCATION_SCOPE_KEY,
    valueEquals: "broad-immediate",
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "harmful",
    feedback: {
      title: "Broad-immediate revocation broke dependent systems that had no replacement yet",
      explanation:
        "Revoking the exposed credential for every dependent system at once, before any cohort had migrated to a new credential, fixed the security exposure instantly but created a real, measurable, and entirely avoidable outage for every not-yet-migrated integration. Containment must be sequenced by dependent-system cohort, not applied as a single broad action regardless of readiness.",
    },
  },
  {
    id: "acr_5",
    controlKey: REVOCATION_SCOPE_KEY,
    valueEquals: "cohort-staged",
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "beneficial",
    feedback: {
      title: "Cohort-staged revocation removed the old credential only where it was already safe to do so",
      explanation:
        "Staging revocation by dependent-system cohort — revoking the exposed credential only for cohorts that have already migrated to a new one — closes the exposure for those systems with zero avoidable breakage, while cohorts still mid-migration keep working on the old credential until they too are ready. This is the scenario's required safe sequencing: narrow and monitor first, then stage rotation, then fully revoke.",
    },
  },

  // ── investigationStatus ───────────────────────────────────────────
  {
    id: "acr_6",
    controlKey: INVESTIGATION_STATUS_KEY,
    valueEquals: "scope-identified",
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "beneficial",
    feedback: {
      title: "Identifying blast radius made safe cohort sequencing possible",
      explanation:
        "Completing blast-radius investigation — confirming which Applications and External Integrations actually rely on this credential — is what makes a genuinely safe cohort-staged rotation plan possible at all. Without it, any cohort sequencing is only safe by accident.",
    },
  },
  {
    id: "acr_7",
    controlKey: INVESTIGATION_STATUS_KEY,
    valueEquals: "not-started",
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "neutral",
    feedback: {
      title: "Investigation alone neither helps nor harms, but delays safe sequencing",
      explanation:
        "Leaving blast-radius investigation unstarted does not itself worsen security or availability, but it leaves the dependent-system cohorts unconfirmed — a real prerequisite gap for safely sequencing cohort-staged rotation. Per the containment-sequencing invariant, investigation is necessary before broad action is safe, but must not become an excuse to delay containment itself (monitoring and narrowing trust remain available and effective in the meantime).",
    },
  },

  // ── newCredentialIssued ───────────────────────────────────────────
  {
    id: "acr_8",
    controlKey: NEW_CREDENTIAL_ISSUED_KEY,
    valueEquals: true,
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "beneficial",
    feedback: {
      title: "Issuing a clean replacement credential made real migration possible",
      explanation:
        "Issuing a new credential via the Secret Manager is the necessary prerequisite for any dependent-system cohort to genuinely migrate away from the exposed credential — without it, flipping the migration control is meaningless, since there is nothing real for any cohort to have moved to.",
    },
  },

  // ── dependentCohortMigration ──────────────────────────────────────
  {
    id: "acr_9",
    controlKey: DEPENDENT_COHORT_MIGRATION_KEY,
    valueEquals: "cohort-a-and-b-migrated",
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "beneficial",
    feedback: {
      title: "Completing migration for every known cohort made full, safe revocation possible",
      explanation:
        "Once every known dependent-system cohort has genuinely migrated to the new credential (which still requires real elapsed migration time per cohort, never instantly), the old exposed credential can be fully revoked everywhere with zero avoidable breakage — the scenario's complete, safe resolution.",
    },
  },

  // ── misuseMonitoring ──────────────────────────────────────────────
  {
    id: "acr_10",
    controlKey: MISUSE_MONITORING_KEY,
    valueEquals: true,
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "beneficial",
    feedback: {
      title: "Active misuse monitoring made continued exposure risk detectable",
      explanation:
        "Enabling active monitoring on the exposed credential's usage means any use after exposure was identified — legitimate or suspicious — is detected and counted, rather than going unnoticed. This does not by itself contain the exposure, but it is a required ingredient of a genuinely monitored (rather than merely declared) containment posture.",
    },
  },
  {
    id: "acr_11",
    controlKey: MISUSE_MONITORING_KEY,
    valueEquals: false,
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "neutral",
    feedback: {
      title: "Without active monitoring, continued use goes undetected",
      explanation:
        "Leaving usage monitoring off does not itself make the exposure worse, but it means any continued use of the exposed credential — legitimate or malicious — cannot be confidently detected or counted in real time, a real audit-posture gap distinct from the live containment decision itself.",
    },
  },

  // ── auditLogReviewCompleted ───────────────────────────────────────
  {
    id: "acr_12",
    controlKey: AUDIT_LOG_REVIEW_KEY,
    valueEquals: true,
    whenTriggerEquals: { exposureIdentified: true },
    outcome: "beneficial",
    feedback: {
      title: "Completing the historical audit review closed the auditability gap",
      explanation:
        "Reviewing CI/CD artifact history, Logging history, and Secret Manager access logs reconstructs what happened BEFORE and DURING the exposure window — something live monitoring alone can never do, since it only ever sees usage from the moment it was turned on forward. This is what makes the auditability invariant (every use of the exposed credential after exposure was identified must be recorded as an auditable historical fact) genuinely satisfied rather than merely assumed.",
    },
  },
];
