import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { IDENTITY_TRUST_SCORING_KEY, RATE_LIMITER_MODE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "false-positives-baseline": 540,
  "false-positives-sustained-unaddressed": 900,
  "abuse-signal-disabled": 650,
  "exemption-unreliable": 180,
  // Bypass/relaxation paths look cheap on this axis by design —
  // legitimate-user availability is genuinely good (or fully restored)
  // while the lever is active. The real cost of these paths is paid
  // entirely in dataIntegrity/reliability scoring, never here (see
  // scoring.ts's module comment).
  "rate-limiter-disabled": 10,
  "rate-limiter-disabled-sustained": 10,
  "rate-limiter-disabled-during-investigation": 5,
  "rate-limiter-relaxed": 60,
  "rate-limiter-relaxed-sustained": 60,
  "targeted-rollback-fixed": 0,
  "patched-forward-fix": 0,
  "exemption-safe": 20,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 180,
  perUnitMonthlyUsd: {
    [`${RATE_LIMITER_MODE_KEY}:relaxed`]: 0,
    [`${RATE_LIMITER_MODE_KEY}:disabled`]: 0,
    [`${IDENTITY_TRUST_SCORING_KEY}:enabled`]: 30,
    [`${IDENTITY_TRUST_SCORING_KEY}:disabled`]: 0,
  },
};

/**
 * successCondition (OPTIMAL) requires a fully restored state: the
 * detection rule itself is fixed (rollback or patch), legitimate users
 * are fully unblocked, and abuse protection has never been bypassed.
 * abuseProtectionStatus must literally equal "fully-restored", which
 * only the two real fix rules (targeted-rollback-fixed,
 * patched-forward-fix) ever set.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "legitimateUserSuccessRate", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "abuseProtectionStatus", operator: "equals", comparedTo: "fully-restored" },
    { key: "cumulativeAbuseRequestsAllowedCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 20,
};

/**
 * acceptableCondition (ACCEPTABLE) — the legitimate bounded handback:
 * the specifically-flagged false-positive population has been exempted
 * using a live trust signal, real abuse screening remains fully
 * intact, and no security violation has occurred — even though the
 * underlying detection-rule defect has not yet itself been fixed.
 * abuseProtectionStatus must literally equal "targeted-fix-applied",
 * which only exemption-with-trust-scoring-safe ever sets.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "abuseProtectionStatus", operator: "equals", comparedTo: "targeted-fix-applied" },
    { key: "cumulativeAbuseRequestsAllowedCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 20,
};

/**
 * Failure condition: a sustained, severe abuse-exposure compromise. If
 * cumulativeAbuseRequestsAllowedCount is allowed to climb past 2,000
 * (i.e. the candidate leaves a broad bypass/relaxation lever active
 * through the sustained-escalation and investigation-availability
 * windows) and stays there, the incident is treated as an automatic
 * failure — failure is never gated by completion mode (tick.ts), so a
 * candidate cannot simply decline to Finish and wait out a live,
 * worsening abuse-exposure violation.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "cumulativeAbuseRequestsAllowedCount", operator: "greater_than_or_equal", comparedTo: 2_000 },
  ],
  sustainedSeconds: 45,
};
