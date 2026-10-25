import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Service-to-service call health (the visible symptom) ───────────
  // Percentage of Service B -> Service C calls that authenticate and
  // succeed. Drops hard the instant a premature revocation creates a
  // gap for any still-unrotated workload; this is the pressure a
  // candidate feels tempted to "fix" instantly via the bypass lever.
  serviceToServiceCallSuccessRate: 99.8,

  // Percentage of calls currently failing specifically on
  // authentication (as opposed to any other failure mode) — isolates
  // the credential-gap symptom from generic request failure.
  authenticationFailureRatePercent: 0,

  // Percentage of the Service B fleet whose calls are CURRENTLY being
  // served by the real, enforced authentication path using a genuinely
  // valid credential (old or new). This is the scenario's core safety
  // signal, distinct from serviceToServiceCallSuccessRate: a call can
  // "succeed" at 100% while this reads far below 100% if validation has
  // been disabled — success alone never proves authenticity.
  genuinelyAuthenticatedCallPercent: 100,

  // What share of Service B's fleet the Issuer/Secret Manager currently
  // believe have adopted the new credential, read directly off
  // rotationCohortStage's candidate-visible value, duplicated as a
  // numeric field so recovery-lag/scoring can read progress generically.
  //   not-started            -> 0
  //   cohort-1-verified      -> 35
  //   cohort-2-verified      -> 70
  //   all-cohorts-verified   -> 100
  newCredentialAdoptionPercent: 0,

  // Generic string-state summary of the rotation's overall safety,
  // read by success/acceptable conditions and by scoring.
  //   "not-started"        — rotation has not begun; old credential is
  //                          the only one in use, nothing is wrong yet.
  //   "safe-overlap"       — new credential activated, cohorts rotating
  //                          in stages, old credential still valid for
  //                          every workload that hasn't rotated yet.
  //   "premature-gap"      — the old credential was revoked before
  //                          every cohort verified adoption: a real,
  //                          self-inflicted authentication gap exists
  //                          right now for at least one workload.
  //   "bypassed"           — credential validation has been disabled
  //                          to paper over a gap: calls are succeeding
  //                          but are NOT being authenticated. Permanent,
  //                          cumulative security violation in progress.
  //   "rolled-back-safe"   — a premature revocation was deliberately,
  //                          auditably undone by re-extending the old
  //                          credential's validity, closing the gap
  //                          without ever bypassing validation.
  //   "fully-rotated"      — every cohort has verified the new
  //                          credential AND the old credential has been
  //                          safely revoked only after that verification
  //                          — the genuine end state of a safe rotation.
  rotationSafetyStatus: "not-started",

  // ── HISTORICAL / CUMULATIVE security damage (phase-6e-strategy-spec.md
  // section 11's required historical-damage model). Only ever increases
  // while credentialValidationMode is "disabled-temporarily"; never
  // reset by re-enabling validation or by any later fix — see rules.ts
  // and definition.ts's completion-mode audit for the explicit
  // non-reset proof.
  cumulativeUnauthenticatedCallCount: 0,
};
