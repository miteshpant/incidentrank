import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Decoy-healthy signal ─────────────────────────────────────────
  // Token Verification never degrades in this scenario, by design — a
  // candidate who only watches this number concludes nothing serious
  // is wrong, which is exactly the misleading first read this scenario
  // is built around.
  tokenVerificationSuccessRate: 99.9,

  // ── MFA Provider health ──────────────────────────────────────────
  mfaProviderLatencyMs: 80,
  mfaProviderFailureRate: 0.2,
  mfaProviderStatus: "normal",

  // ── Session Store pressure (the scenario's required recovery-lag
  // metric — see rules.ts for the multi-window decay) ──────────────
  sessionStorePressureLevel: 10,
  sessionStoreStatus: "normal",
  // Active sessions unnecessarily invalidated by session-store relief
  // mechanics (business invariant #5). Zero under every safe
  // combination; nonzero whenever relief-eviction runs without
  // token-only continuation protecting active sessions first.
  activeSessionsUnnecessarilyInvalidatedCount: 0,

  // ── Login outcomes ───────────────────────────────────────────────
  lowRiskLoginSuccessRate: 99,
  highRiskLoginSuccessRate: 99,
  privilegedActionAvailability: 100,

  // ── HISTORICAL / CUMULATIVE security damage (phase6d3.md's required
  // historical-damage model for this scenario). Only ever increases
  // while an unsafe-bypass lever is active; never reset by restoring
  // policy afterward — see rules.ts and definition.ts's completion-mode
  // audit for the explicit non-reset proof. ───────────────────────────
  highRiskActionsAuthenticatedWithoutMfaCount: 0,

  // Generic string-state field read by scoring's dataIntegrity measure
  // and by successCondition/acceptableCondition — the single
  // authoritative summary of "what kind of security state is this."
  //   "unprotected"  — the incident is active and no adequate policy
  //                    is in effect yet (mandatory-all is SAFE but not
  //                    sufficient on its own to resolve the incident;
  //                    "unprotected" here specifically means degraded
  //                    tokenless/low-risk flows are being needlessly
  //                    blocked or pressure is unaddressed).
  //   "fail-closed"  — mandatory-all is in effect: safe, but blunt —
  //                    both low- and high-risk logins requiring MFA
  //                    are blocked while the provider is degraded.
  //   "bounded-degraded" — the legitimate degraded state: low-risk
  //                    logins use the explicitly-allowed bounded
  //                    degraded flow, high-risk/privileged logins
  //                    remain protected (blocked or temporarily
  //                    unavailable, never bypassed).
  //   "compromised"  — an MFA-bypass lever is currently active for
  //                    high-risk or privileged actions. Permanent,
  //                    cumulative security violation in progress.
  //   "restored"     — the MFA Provider has fully recovered and normal
  //                    mandatory-all MFA is back in effect for
  //                    everyone, with no bypass ever active.
  authSecurityStatus: "unprotected",

  // Generic string-state field read by scoring's reliability dimension,
  // isolating the pressure-TRANSFER trap's severity from ordinary
  // criticalTimeRatio (which the plain fail-closed baseline also maxes
  // out, since both spend the whole window critical) — the generic
  // scorer has no numeric-threshold penalty measure for an arbitrary
  // field like sessionStorePressureLevel/mfaProviderFailureRate, only
  // finalStringEquals/NotEquals on a string field (schema.ts), so this
  // closed three-value enumeration exists specifically to let scoring
  // distinguish "pressure is climbing on its own" from "pressure was
  // actively amplified by a candidate choice."
  //   "normal"    — no pressure-transfer lever is active.
  //   "elevated"  — ordinary incident pressure (fail-closed baseline,
  //                 sustained escalation, relief not yet engaged).
  //   "amplified" — the pressure-transfer trap (unlimited concurrency +
  //                 aggressive retries) is actively making both the
  //                 Session Store and the MFA Provider worse.
  systemPressureSeverity: "normal",
};
