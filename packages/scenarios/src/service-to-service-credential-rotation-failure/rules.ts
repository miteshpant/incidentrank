import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CREDENTIAL_VALIDATION_MODE_KEY,
  NEW_CREDENTIAL_ACTIVATION_KEY,
  OLD_CREDENTIAL_VALIDITY_KEY,
  ROLLBACK_OLD_CREDENTIAL_KEY,
  ROTATION_COHORT_STAGE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "secret-manager": "healthy",
  "cert-token-issuer": "healthy",
};

const stalledHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "secret-manager": "degraded",
};

const rotatingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "service-b": "degraded",
  "secret-manager": "degraded",
};

const gapHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "service-a": "critical",
  "service-b": "critical",
  "secret-manager": "degraded",
};

const bypassedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "service-c": "critical",
  "secret-manager": "degraded",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "service-a": "degraded",
  "service-b": "degraded",
};

/**
 * Authored rule table for Service-to-Service Credential Rotation
 * Failure. ORDERING IS LOAD-BEARING (first-match-wins, see
 * packages/simulator/src/rules.ts's matchRule): since RuleCondition has
 * no native "not_equals" for a multi-value select control like
 * rotationCohortStage (packages/scenarios/src/authoring/schema.ts's
 * documented constraint), the only way to express "old credential
 * revoked AND all cohorts verified" (safe) vs. "old credential revoked
 * AND NOT all cohorts verified" (the premature-gap trap) is to place
 * the SAFE, more-specific "revoked + all-cohorts-verified" rules BEFORE
 * the generic "revoked" trap rules below. A rule authored with
 * oldCredentialValidity: "revoked" alone therefore only ever actually
 * matches once every more-specific "revoked but genuinely safe" rule
 * above it has already failed to match — this is deliberate, not
 * accidental breadth.
 *
 * Checked in this order: (1) unsafe security traps (bypass — win
 * regardless of every other control, because an unauthenticated call is
 * never acceptable no matter how healthy the success-rate metric
 * looks), (2) the safe fully-rotated/all-cohorts-verified end state
 * with revocation (must be checked before the generic revoked-trap
 * rules below, for the reason above), (3) the premature-revocation
 * outage trap (generic "revoked" — now safely scoped to only the
 * unsafe cases by ordering), (4) safe staged-rotation progress with the
 * old credential still valid (checked before rollback below so a stale
 * rollback flag never shadows genuine cohort progress), (5) rollback
 * recovery-lag progression, (6) sequencing trap #2 (false
 * verification), (7) baseline.
 *
 * ROOT CAUSE: a routine, otherwise-safe credential rotation is in
 * progress. Overlapping validity (old credential still valid while the
 * new one is phased in cohort-by-cohort) is the SAFE mechanism this
 * scenario is built around, per business invariant #2 — it is never a
 * risk to eliminate early. The actual danger is entirely self-inflicted
 * SEQUENCING: revoking the old credential before every cohort has
 * verified adoption of the new one creates a real outage (business
 * invariant #3), and the tempting "instant fix" for that self-inflicted
 * gap — disabling credential validation broadly — is a real,
 * cumulative authentication-bypass security violation (the scenario's
 * required security invariant), never a legitimate way to bridge a
 * credential gap.
 *
 * SEQUENCING TRAP #1 (the scenario's central judgment, per
 * phase-6e-strategy-spec.md's "sequencing and blast-radius control"):
 * revoking oldCredentialValidity before rotationCohortStage reaches
 * "all-cohorts-verified" creates premature-gap. Revoking only AFTER all
 * cohorts are verified never does (fully-rotated-safe, below).
 *
 * SEQUENCING TRAP #2 (activation-before-verification): rotationCohortStage
 * only represents a REAL verification if newCredentialActivation was
 * already true at the moment of advancing it — a candidate who
 * advances cohort stage before activating the new credential on Service
 * C has verified nothing real (there was nothing valid yet to verify
 * against). This scenario treats that ordering mistake as "no real
 * cohort progress has occurred" rather than silently accepting a false
 * verification: see "false-verification-activation-skipped" below,
 * which matches whenever newCredentialActivation is false regardless of
 * what rotationCohortStage claims, keeping newCredentialAdoptionPercent
 * pinned at 0.
 *
 * TEMPTING UNSAFE PATH (the required availability-good/security-bad
 * trap): credentialValidationMode = "disabled-temporarily" while a
 * premature-revocation gap is open makes serviceToServiceCallSuccessRate
 * near-perfect instantly (every authentication failure is replaced by
 * an unconditional accept) — availability genuinely, immediately
 * improves — but genuinelyAuthenticatedCallPercent collapses to 0 and
 * cumulativeUnauthenticatedCallCount increases every tick it stays
 * active, with real, distinct, non-reset authored values. This can
 * NEVER satisfy either completion condition, however long it runs.
 *
 * HISTORICAL DAMAGE MODEL: cumulativeUnauthenticatedCallCount only ever
 * increases while credentialValidationMode is actively
 * "disabled-temporarily". Switching back to "enforced" stops NEW
 * unauthenticated calls but the cumulative count is carried forward
 * unchanged in every subsequent rule state — it is never reset to zero
 * by any control or any amount of elapsed time (see definition.ts's
 * completion-mode audit for the explicit peak-tracking proof).
 *
 * SANCTIONED FIX (never a reskin of the bypass): rollbackOldCredentialValidity
 * = true deliberately, auditably re-extends the old credential's
 * validity window (candidate must ALSO set oldCredentialValidity back
 * to "valid" — the rollback flag alone, without un-revoking, is not
 * itself the fix; see rollback-* rules below, which require BOTH), and
 * closes the SAME authentication gap the bypass "fixes" — but with
 * genuinelyAuthenticatedCallPercent staying at 100 the entire time
 * (every served call really was authenticated by a genuinely valid
 * credential), and zero contribution to the historical violation count.
 * Recovery is NOT instant: already-failing Service B instances only
 * resume success across the two elapsed-time rollback-propagation
 * windows in timed-events.ts (recovery-lag binding).
 *
 * ALTERNATE STRONG PATH: a candidate who simply never revokes the old
 * credential prematurely in the first place (stages cohorts correctly,
 * revokes only once all-cohorts-verified) never needs any rollback or
 * bypass at all — this is the cleanest, fastest-to-OPTIMAL path and is
 * authored identically to "rollback after a mistake, then let the
 * rotation finish correctly" once both reach fully-rotated-safe.
 */
export const serviceToServiceCredentialRotationFailureRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE SECURITY TRAP — authentication bypass actively happening.
  // Checked first; wins regardless of every other control, including
  // cohort stage or revocation state.
  // ══════════════════════════════════════════════════════════════════

  // ── Bypass while gap is sustained: the worst reachable state. Listed
  // before the non-sustained variant (sustainedGapWindow implies
  // rotationActive, so the more specific rule must come first or it
  // would be permanently shadowed — same first-match-wins ordering
  // discipline as every prior phase's security scenarios).
  {
    id: "bypass-sustained-gap",
    when: {
      triggerEquals: { rotationActive: true, sustainedGapWindow: true },
      controlEquals: {
        [OLD_CREDENTIAL_VALIDITY_KEY]: "revoked",
        [CREDENTIAL_VALIDATION_MODE_KEY]: "disabled-temporarily",
      },
    },
    incidentState: "bypass-sustained",
    values: {
      serviceToServiceCallSuccessRate: 99.9,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 0,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "bypassed",
      cumulativeUnauthenticatedCallCount: 640,
    },
    componentHealth: bypassedHealth,
  },
  {
    id: "bypass-active",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: {
        [OLD_CREDENTIAL_VALIDITY_KEY]: "revoked",
        [CREDENTIAL_VALIDATION_MODE_KEY]: "disabled-temporarily",
      },
    },
    incidentState: "bypass-active",
    values: {
      serviceToServiceCallSuccessRate: 99.8,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 0,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "bypassed",
      cumulativeUnauthenticatedCallCount: 180,
    },
    componentHealth: bypassedHealth,
  },

  // Bypass engaged even without the old credential ever being revoked
  // (a candidate who disables validation pre-emptively, "just in
  // case"): still a real, counted violation — disabling validation is
  // never a legitimate standing posture during a rotation, whether or
  // not a gap currently exists.
  {
    id: "bypass-without-revocation",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: { [CREDENTIAL_VALIDATION_MODE_KEY]: "disabled-temporarily" },
    },
    incidentState: "bypass-preemptive",
    values: {
      serviceToServiceCallSuccessRate: 99.9,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 0,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "bypassed",
      cumulativeUnauthenticatedCallCount: 150,
    },
    componentHealth: bypassedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE END STATE WITH REVOCATION — all cohorts genuinely verified
  // (newCredentialActivation true) BEFORE the old credential was
  // revoked. Checked BEFORE the generic premature-gap trap rules below
  // so this specific, safe combination is never shadowed by the
  // broader "revoked" trap condition (see module doc comment's ordering
  // note). Validation mode must also be enforced — if it is not, the
  // bypass rules above already won.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "fully-rotated-safe",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: {
        [NEW_CREDENTIAL_ACTIVATION_KEY]: true,
        [ROTATION_COHORT_STAGE_KEY]: "all-cohorts-verified",
        [OLD_CREDENTIAL_VALIDITY_KEY]: "revoked",
        [CREDENTIAL_VALIDATION_MODE_KEY]: "enforced",
      },
    },
    incidentState: "fully-rotated-safe",
    values: {
      serviceToServiceCallSuccessRate: 99.9,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 100,
      rotationSafetyStatus: "fully-rotated",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PREMATURE-REVOCATION OUTAGE TRAP — old credential revoked while NOT
  // every cohort was verified (reaching this point means the safe
  // "fully-rotated-safe" rule above did not match). Validation is still
  // enforced here (no security violation — purely an availability
  // consequence of bad sequencing); the bypass rules above already
  // caught the case where validation was also disabled.
  // ══════════════════════════════════════════════════════════════════

  {
    id: "premature-gap-sustained",
    when: {
      triggerEquals: { rotationActive: true, sustainedGapWindow: true },
      controlEquals: { [OLD_CREDENTIAL_VALIDITY_KEY]: "revoked" },
    },
    incidentState: "premature-gap-sustained",
    values: {
      serviceToServiceCallSuccessRate: 42,
      authenticationFailureRatePercent: 58,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "premature-gap",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: gapHealth,
  },
  {
    id: "premature-gap",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: { [OLD_CREDENTIAL_VALIDITY_KEY]: "revoked" },
    },
    incidentState: "premature-gap",
    values: {
      serviceToServiceCallSuccessRate: 61,
      authenticationFailureRatePercent: 39,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "premature-gap",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: gapHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE STAGED ROTATION PROGRESS — overlapping validity maintained the
  // entire time (oldCredentialValidity never revoked). This is the
  // required safe path: the new credential is activated first, cohorts
  // are verified in stages, and nothing about the system is ever
  // broken while the candidate does this. Checked BEFORE the rollback
  // recovery-lag rules below so a candidate who has legitimately
  // completed cohort verification is never shadowed by a stale
  // rollbackOldCredentialValidity flag left on from an earlier,
  // unrelated experiment (the rollback rules below additionally gate
  // on rotationCohortStage implicitly, since they only ever matter once
  // a REAL premature-gap existed — but ordering here is what makes that
  // true rather than leaving it to chance).
  // ══════════════════════════════════════════════════════════════════

  // ── All cohorts verified, old credential NOT yet revoked: safe
  // overlap maintained, rotation functionally complete but the old
  // credential has not been cleaned up yet. A real, legitimate
  // intermediate state — not required to revoke immediately.
  {
    id: "all-cohorts-verified-safe-overlap",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: {
        [NEW_CREDENTIAL_ACTIVATION_KEY]: true,
        [ROTATION_COHORT_STAGE_KEY]: "all-cohorts-verified",
        [OLD_CREDENTIAL_VALIDITY_KEY]: "valid",
      },
    },
    incidentState: "all-cohorts-verified-overlap",
    values: {
      serviceToServiceCallSuccessRate: 99.8,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 100,
      rotationSafetyStatus: "safe-overlap",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: rotatingHealth,
  },

  // ── Cohort 2 verified, old still valid: real, further staged
  // progress than cohort 1, strictly below full adoption.
  {
    id: "cohort2-verified-safe-overlap",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: {
        [NEW_CREDENTIAL_ACTIVATION_KEY]: true,
        [ROTATION_COHORT_STAGE_KEY]: "cohort-2-verified",
        [OLD_CREDENTIAL_VALIDITY_KEY]: "valid",
      },
    },
    incidentState: "cohort2-verified-overlap",
    values: {
      serviceToServiceCallSuccessRate: 99.8,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 70,
      rotationSafetyStatus: "safe-overlap",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: rotatingHealth,
  },

  // ── Cohort 1 verified, old still valid: first real staged progress.
  {
    id: "cohort1-verified-safe-overlap",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: {
        [NEW_CREDENTIAL_ACTIVATION_KEY]: true,
        [ROTATION_COHORT_STAGE_KEY]: "cohort-1-verified",
        [OLD_CREDENTIAL_VALIDITY_KEY]: "valid",
      },
    },
    incidentState: "cohort1-verified-overlap",
    values: {
      serviceToServiceCallSuccessRate: 99.8,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 35,
      rotationSafetyStatus: "safe-overlap",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: rotatingHealth,
  },

  // ── New credential activated, no cohort verified yet: safe but no
  // real progress yet — the overlap window is open and nothing is
  // broken, but adoption has not actually started.
  {
    id: "new-credential-activated-no-cohorts",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: {
        [NEW_CREDENTIAL_ACTIVATION_KEY]: true,
        [ROTATION_COHORT_STAGE_KEY]: "not-started",
        [OLD_CREDENTIAL_VALIDITY_KEY]: "valid",
      },
    },
    incidentState: "activated-no-cohorts",
    values: {
      serviceToServiceCallSuccessRate: 99.8,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "safe-overlap",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: rotatingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // RECOVERY LAG — a premature gap was properly closed via deliberate
  // rollback: BOTH rollbackOldCredentialValidity=true AND
  // oldCredentialValidity set back to "valid" (the rollback flag alone
  // is audit metadata, not itself the fix — the candidate must also
  // actually re-extend validity). Already-failing instances reconnect
  // only across real elapsed-time windows, never instantly. Checked
  // after the premature-gap trap rules AND after the safe staged-
  // progress rules above, so a rollback flag left on from an earlier
  // experiment never shadows genuine cohort-verification progress, and
  // a rollback that has not yet ALSO flipped oldCredentialValidity back
  // to "valid" still correctly falls through to the premature-gap trap
  // (the flag alone fixes nothing).
  // ══════════════════════════════════════════════════════════════════

  {
    id: "rollback-fully-propagated",
    when: {
      triggerEquals: { rotationActive: true, rollbackPropagationFullyDone: true },
      controlEquals: {
        [ROLLBACK_OLD_CREDENTIAL_KEY]: true,
        [OLD_CREDENTIAL_VALIDITY_KEY]: "valid",
      },
    },
    incidentState: "rollback-recovered",
    values: {
      serviceToServiceCallSuccessRate: 99.7,
      authenticationFailureRatePercent: 0.1,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "rolled-back-safe",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: healthyHealth,
  },
  {
    id: "rollback-propagation-window1",
    when: {
      triggerEquals: {
        rotationActive: true,
        rollbackPropagationWindow1Elapsed: true,
        rollbackPropagationFullyDone: false,
      },
      controlEquals: {
        [ROLLBACK_OLD_CREDENTIAL_KEY]: true,
        [OLD_CREDENTIAL_VALIDITY_KEY]: "valid",
      },
    },
    incidentState: "rollback-recovering-window1",
    values: {
      serviceToServiceCallSuccessRate: 84,
      authenticationFailureRatePercent: 16,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "rolled-back-safe",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: recoveringHealth,
  },
  {
    id: "rollback-just-issued",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: {
        [ROLLBACK_OLD_CREDENTIAL_KEY]: true,
        [OLD_CREDENTIAL_VALIDITY_KEY]: "valid",
      },
    },
    incidentState: "rollback-just-issued",
    values: {
      serviceToServiceCallSuccessRate: 65,
      authenticationFailureRatePercent: 35,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "rolled-back-safe",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: recoveringHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SEQUENCING TRAP #2 — cohort stage advanced WITHOUT the new
  // credential ever being activated on Service C. Nothing was really
  // verified: a workload "confirmed" against a validator that doesn't
  // accept the new credential at all has not actually rotated. Matches
  // whenever newCredentialActivation is false (regardless of what
  // rotationCohortStage claims) and the old credential is still valid —
  // exposing the false verification by pinning adoption at 0, rather
  // than silently rewarding it. Checked after every genuine
  // newCredentialActivation:true progress rule above, so it only
  // catches the activation-skipped case.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "false-verification-activation-skipped",
    when: {
      triggerEquals: { rotationActive: true },
      controlEquals: {
        [NEW_CREDENTIAL_ACTIVATION_KEY]: false,
        [OLD_CREDENTIAL_VALIDITY_KEY]: "valid",
      },
    },
    incidentState: "activation-skipped",
    values: {
      serviceToServiceCallSuccessRate: 99.8,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "not-started",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: stalledHealth,
  },

  // NOTE: there is deliberately no separate catch-all "rotation
  // started, nothing touched yet" rule here beyond
  // "false-verification-activation-skipped" above. Every reachable
  // combination of this scenario's 5 controls while rotationActive is
  // true is claimed by some specific rule above (bypass by
  // credentialValidationMode, fully-rotated-safe/premature-gap by
  // oldCredentialValidity, safe-staged-progress/rollback/activation-
  // skipped by newCredentialActivation+oldCredentialValidity+rollback)
  // — a true zero-action baseline (every control at its default) is
  // exactly the activation-skipped combination
  // (newCredentialActivation=false, oldCredentialValidity="valid"), so
  // a separate "baseline" rule authored identically would be dead code
  // that first-match-wins could never reach. See the control-usage
  // audit in the scenario's completion report for the explicit dead-
  // rule check this removal is based on.

  // ── Default/fallback: before the rotation begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      serviceToServiceCallSuccessRate: 99.8,
      authenticationFailureRatePercent: 0,
      genuinelyAuthenticatedCallPercent: 100,
      newCredentialAdoptionPercent: 0,
      rotationSafetyStatus: "not-started",
      cumulativeUnauthenticatedCallCount: 0,
    },
    componentHealth: healthyHealth,
  },
];
