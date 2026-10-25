import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  LOGIN_CONCURRENCY_LIMIT_KEY,
  RISK_ENGINE_MODE_KEY,
  SESSION_CACHE_MODE_KEY,
} from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "fail-closed-mandatory-all-baseline": 420,
  "fail-closed-mandatory-all-sustained": 620,
  "bounded-degrade-requested-risk-engine-disabled": 420,
  "bounded-degrade-protected-privileged": 90,
  "bounded-degrade-privileged-unavailable": 60,
  "relief-eviction-without-token-protection": 260,
  "pressure-amplified-retries-and-concurrency": 900,
  // Bypass paths look cheap on this axis by design — availability is
  // genuinely good while bypass is active. The real cost of these
  // paths is paid entirely in dataIntegrity/reliability scoring, never
  // here (see scoring.ts's module comment).
  "mfa-bypass-all-compromised": 10,
  "mfa-bypass-all-compromised-sustained": 10,
  "mfa-bypass-all-compromised-during-recovery": 5,
  "privileged-allow-with-cached-risk-compromised": 30,
  "privileged-allow-with-cached-risk-compromised-sustained": 30,
  "mfa-provider-recovering-pressure-unaddressed": 70,
  "mfa-provider-recovered-pressure-unaddressed": 50,
  "relief-just-engaged": 40,
  "relief-draining-window1-safe": 20,
  "relief-draining-window2-safe": 5,
  "fully-relieved-safe": 0,
  "fully-relieved-via-throttling": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 260,
  perUnitMonthlyUsd: {
    [`${LOGIN_CONCURRENCY_LIMIT_KEY}:throttled`]: 40,
    [`${LOGIN_CONCURRENCY_LIMIT_KEY}:unlimited`]: 0,
    [`${SESSION_CACHE_MODE_KEY}:relief-eviction`]: 60,
    [`${SESSION_CACHE_MODE_KEY}:disabled`]: 0,
    [`${RISK_ENGINE_MODE_KEY}:cached-risk-scores`]: 20,
    [`${RISK_ENGINE_MODE_KEY}:disabled`]: 0,
  },
};

/**
 * successCondition (OPTIMAL) requires the fully-relieved state: the
 * MFA Provider has genuinely recovered, session-store pressure has
 * fully drained (the required recovery-lag window), and no security
 * violation has ever been in effect this tick (authSecurityStatus
 * must not be "compromised" — this is what actually prevents a
 * bypass-then-revert path from ever reaching OPTIMAL in the SAME tick
 * as a bypass rule, since those two incidentStates are mutually
 * exclusive rule matches; see rules.ts's ordering).
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "sessionStorePressureLevel", operator: "less_than_or_equal", comparedTo: 15 },
    { key: "mfaProviderStatus", operator: "equals", comparedTo: "normal" },
    { key: "authSecurityStatus", operator: "not_equals", comparedTo: "compromised" },
    { key: "activeSessionsUnnecessarilyInvalidatedCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 20,
};

/**
 * acceptableCondition (ACCEPTABLE) — the legitimate bounded-degraded
 * handback: low-risk logins are succeeding through the explicitly-
 * allowed degraded flow, high-risk/privileged logins remain genuinely
 * protected (never bypassed), and no unnecessary session invalidation
 * or security violation has occurred — even though the MFA Provider
 * itself has not yet fully recovered and session-store pressure has
 * not yet fully drained. This is deliberately a looser bar than
 * successCondition on availability (highRiskLoginSuccessRate stays low
 * while protected — that's correct, not a defect), but an EQUALLY
 * strict bar on security: authSecurityStatus must literally equal
 * "bounded-degraded", which only the two real bounded-degrade rules
 * ever set.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [{ key: "authSecurityStatus", operator: "equals", comparedTo: "bounded-degraded" }],
  sustainedSeconds: 20,
};

/**
 * Failure condition: a sustained, severe security compromise. If
 * highRiskActionsAuthenticatedWithoutMfaCount is allowed to climb past
 * 40 (i.e. the candidate leaves a bypass lever active through the
 * sustained-pressure escalation window) and stays there, the incident
 * is treated as an automatic failure — failure is never gated by
 * completion mode (tick.ts), so a candidate cannot simply decline to
 * Finish and wait out a live, worsening security violation.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "highRiskActionsAuthenticatedWithoutMfaCount", operator: "greater_than_or_equal", comparedTo: 40 },
  ],
  sustainedSeconds: 45,
};
