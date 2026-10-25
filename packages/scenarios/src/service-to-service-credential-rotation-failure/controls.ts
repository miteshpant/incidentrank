import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How far staged cohort rotation has progressed across Service B's
 * workload fleet. "not-started" (default): no workload has adopted the
 * new credential yet — every instance is still presenting the old one
 * to Service C. "cohort-1-verified" / "cohort-2-verified": the
 * candidate has confirmed (via newCredentialAdoptionVerification below)
 * that a growing share of the fleet is successfully authenticating with
 * the new credential. "all-cohorts-verified": the entire fleet has been
 * confirmed on the new credential. This control only ADVANCES when the
 * candidate explicitly sets it forward — it never auto-advances on its
 * own, so a candidate who revokes the old credential while this still
 * reads "not-started" has verified nothing at all. Business invariant
 * #4 (rotation cohorts may be staged) is implemented directly by this
 * control: moving through cohort-1 -> cohort-2 -> all is a legitimate,
 * not-strictly-required path (a candidate may also set this straight to
 * "all-cohorts-verified" once genuinely confirmed), but doing so without
 * ever having verified adoption is what the revocation-timing control
 * below checks against.
 */
export const ROTATION_COHORT_STAGE_KEY = "rotationCohortStage";

/**
 * Whether the OLD service-to-service credential is still being
 * verified/accepted for calls from Service B to Service C. "valid"
 * (default): the old credential still works — this is the safe
 * overlapping-validity mechanism business invariant #2 describes, not
 * a risk to eliminate early. "revoked": the old credential has been
 * explicitly invalidated. Revoking while any cohort has not yet been
 * verified on the new credential (rotationCohortStage !==
 * "all-cohorts-verified") creates a real, self-inflicted authentication
 * gap for every still-unrotated workload — business invariant #3 (a
 * premature revocation creates a real outage, not just a security
 * exposure). Revoking only after all cohorts are verified is the
 * correct, final step of a safe rotation.
 */
export const OLD_CREDENTIAL_VALIDITY_KEY = "oldCredentialValidity";

/**
 * Whether Service C's validator currently accepts the NEW credential at
 * all. "not-active" (default): the Issuer may have minted a new
 * credential, but Service C has not yet been configured to accept it —
 * a workload presenting the new credential before this is active fails
 * exactly like a workload presenting a revoked old one. "active": the
 * new credential is accepted alongside the old one. This control must
 * be turned on BEFORE rotationCohortStage can mean anything real — a
 * cohort "verified" against a validator that was never activated is not
 * a real verification at all, which is why rules.ts gates the genuine
 * cohort-progress states on this being active.
 */
export const NEW_CREDENTIAL_ACTIVATION_KEY = "newCredentialActivation";

/**
 * The scenario's central forbidden lever. "enforced" (default): Service
 * C validates every presented credential (old or new) against the
 * Issuer's real validity rules — the only mode in which "a credential
 * is accepted" ever means "a credential was genuinely valid."
 * "disabled-temporarily": Service C stops validating credentials
 * altogether and accepts any call, authenticated or not, purely to
 * restore connectivity during a self-inflicted premature-revocation
 * gap. This looks like an instant fix — every call that was failing
 * with an authentication error immediately starts succeeding again,
 * with no further propagation delay at all — but it is a real,
 * counted authentication-bypass security violation: every call served
 * in this mode is a call that was authenticated by nothing. This is
 * never a legitimate way to bridge a credential gap (business
 * invariant #1 and the scenario's required security invariant); the
 * only sanctioned fix for a premature-revocation gap is
 * rollbackOldCredentialValidity below.
 */
export const CREDENTIAL_VALIDATION_MODE_KEY = "credentialValidationMode";

/**
 * The deliberate, auditable undo for a premature revocation. false
 * (default): no rollback has been issued. true: the old credential's
 * validity window is explicitly, deliberately re-extended — a real
 * configuration change with its own audit trail, restoring the safe
 * overlapping-validity state rather than bypassing validation. This is
 * the scenario's required "the fix is re-extending validity
 * deliberately and auditably, never bypassing credential validation"
 * lever: setting this true and oldCredentialValidity is handled
 * together by rules.ts (rollback wins over a stale "revoked" value),
 * closing the authentication gap for every still-unrotated workload
 * exactly as completely as disabling validation does, but WITHOUT
 * creating any unauthenticated-call exposure at all.
 */
export const ROLLBACK_OLD_CREDENTIAL_KEY = "rollbackOldCredentialValidity";

export const controls: ControlDefinition[] = [
  {
    key: ROTATION_COHORT_STAGE_KEY,
    allowedValues: ["not-started", "cohort-1-verified", "cohort-2-verified", "all-cohorts-verified"],
    initialValue: "not-started",
  },
  {
    key: OLD_CREDENTIAL_VALIDITY_KEY,
    allowedValues: ["valid", "revoked"],
    initialValue: "valid",
  },
  {
    key: NEW_CREDENTIAL_ACTIVATION_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CREDENTIAL_VALIDATION_MODE_KEY,
    allowedValues: ["enforced", "disabled-temporarily"],
    initialValue: "enforced",
  },
  {
    key: ROLLBACK_OLD_CREDENTIAL_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
