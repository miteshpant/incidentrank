import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Decoy-healthy signal ─────────────────────────────────────────
  // Application request success rate never degrades on its own in
  // this scenario — the system is otherwise completely healthy. A
  // candidate who only watches this number will conclude nothing is
  // wrong, which is exactly the misleading first read a believed
  // credential exposure presents: there is no live outage yet, only
  // risk. The only way this number moves at all is as a direct,
  // self-inflicted consequence of broad-immediate revocation without
  // a replacement in place (the scenario's second forbidden lever).
  applicationRequestSuccessRate: 99.9,

  // ── External Integrations health (consequence surface for the
  // broad-immediate-revocation trap) ───────────────────────────────
  externalIntegrationSuccessRate: 99.8,
  externalIntegrationStatus: "normal",

  // ── Blast-radius / containment progress ──────────────────────────
  // "unknown" until investigationStatus = scope-identified; becomes
  // "identified" once blast radius is understood. Purely descriptive
  // of investigation progress, read by scoring/UI, not itself a
  // safety gate (see containmentStatus below for the real gate).
  blastRadiusStatus: "unknown",

  // Cumulative count of dependent-system cohorts genuinely migrated
  // onto a new credential (0, 1, or 2 of the two known cohorts).
  // Real, elapsed-time-gated progress — never jumps on the same tick
  // a control is flipped. See rules.ts / timed-events.ts.
  migratedCohortCount: 0,

  // ── HISTORICAL / CUMULATIVE security damage (phase-6e-strategy-spec
  // section 11/18's required historical-damage model for this
  // scenario). Only ever increases while the exposed credential is
  // still being treated as trusted (fully-trusted) after exposure was
  // identified; never reset by later revoking/rotating it — see
  // rules.ts and definition.ts's completion-mode audit for the
  // explicit non-reset proof. ───────────────────────────────────────
  suspectedExposedCredentialUseCount: 0,

  // Generic string-state field read by scoring's dataIntegrity measure
  // and by successCondition/acceptableCondition — the single
  // authoritative summary of "what is the current containment
  // posture of the believed-exposed credential."
  //   "trusted"     — the incident is active and the exposed credential
  //                   is still being accepted exactly as before
  //                   exposure was identified. This is NEVER safe once
  //                   the incident has started, regardless of how
  //                   healthy availability looks — the central
  //                   security invariant this scenario is built
  //                   around.
  //   "monitored"   — the credential is still live and in use, but
  //                   active usage monitoring is engaged and no
  //                   broad/unsequenced revocation has been attempted
  //                   — a legitimate, bounded first response while a
  //                   real containment plan is built, never a final
  //                   state on its own.
  //   "staged-rotation" — cohort-staged revocation is genuinely in
  //                   progress: cohorts that have migrated to the new
  //                   credential have had the old one revoked for
  //                   them specifically; cohorts that have not yet
  //                   migrated still work on the old credential. A
  //                   real, safe, deliberately incomplete tradeoff.
  //   "broad-revoked-unsequenced" — broad-immediate revocation was
  //                   used while at least one dependent cohort had not
  //                   yet migrated to a replacement — a real,
  //                   avoidable outage was created.
  //   "fully-contained" — every known dependent cohort has migrated to
  //                   the new credential and the old, exposed
  //                   credential has been fully revoked everywhere,
  //                   with zero avoidable breakage.
  credentialContainmentStatus: "trusted",

  // Generic string-state field closing the auditability business
  // invariant: whether a deliberate historical-usage review pass
  // (CI/CD artifact history, Logging history, Secret Manager access
  // logs covering the time BEFORE exposure was even identified) has
  // been completed. "unreviewed" (default) means the full picture of
  // what happened is not yet reconstructed, even if live monitoring is
  // now on. "reviewed" means that historical reconstruction pass has
  // genuinely been done — the only way this field ever changes.
  auditReviewStatus: "unreviewed",
};
