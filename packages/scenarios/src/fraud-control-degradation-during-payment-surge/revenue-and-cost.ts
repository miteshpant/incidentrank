import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { RISK_PROVIDER_CIRCUIT_BREAKER_KEY, RULES_ENGINE_MODE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "fail-closed-mandatory-all-baseline": 480,
  "fail-closed-mandatory-all-sustained": 720,
  "bounded-fallback-requested-rules-engine-disabled": 480,
  "bounded-fallback-fifo": 90,
  "bounded-fallback-risk-weighted": 70,
  "velocity-relaxed-fifo-amplified": 980,
  // Bypass/approve-on-timeout paths look cheap on this axis by design —
  // checkout availability is genuinely good while bypass is active. The
  // real cost of these paths is paid entirely in dataIntegrity/
  // reliability scoring, never here (see scoring.ts's module comment).
  "bypass-all-compromised": 10,
  "bypass-all-compromised-sustained": 10,
  "bypass-all-compromised-during-recovery": 5,
  "approve-on-timeout-compromised": 25,
  "approve-on-timeout-compromised-sustained": 25,
  "risk-provider-recovering-queue-unaddressed": 70,
  "risk-provider-recovered-queue-unaddressed": 50,
  "relief-just-engaged": 35,
  "draining-window1-safe": 15,
  "draining-window2-safe": 5,
  "fully-drained-safe": 0,
  "fully-drained-via-circuit-breaker": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 220,
  perUnitMonthlyUsd: {
    [`${RULES_ENGINE_MODE_KEY}:full`]: 0,
    [`${RULES_ENGINE_MODE_KEY}:reduced`]: -30,
    [`${RULES_ENGINE_MODE_KEY}:disabled`]: -60,
    [`${RISK_PROVIDER_CIRCUIT_BREAKER_KEY}:half-open-probe`]: 20,
    [`${RISK_PROVIDER_CIRCUIT_BREAKER_KEY}:open`]: 10,
  },
};

/**
 * successCondition (OPTIMAL) requires the fully-drained state: the
 * External Risk Provider has genuinely recovered, the manual-review
 * queue has fully drained (the required recovery-lag window), and no
 * fraud-control violation has ever been in effect this tick
 * (fraudControlStatus must not be "compromised" — this is what
 * actually prevents a bypass-then-revert path from ever reaching
 * OPTIMAL in the SAME tick as a bypass rule, since those two
 * incidentStates are mutually exclusive rule matches; see rules.ts's
 * ordering).
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "manualReviewQueueDepth", operator: "less_than_or_equal", comparedTo: 15 },
    { key: "riskProviderStatus", operator: "equals", comparedTo: "normal" },
    { key: "fraudControlStatus", operator: "not_equals", comparedTo: "compromised" },
  ],
  sustainedSeconds: 20,
};

/**
 * acceptableCondition (ACCEPTABLE) — the legitimate bounded-fallback
 * handback: low-risk transactions are succeeding through the
 * explicitly-allowed degraded flow, high-risk transactions remain
 * genuinely protected (never bypassed), and no fraud-control violation
 * has occurred — even though the External Risk Provider itself has not
 * yet fully recovered and the review queue has not yet fully drained.
 * This is deliberately a looser bar than successCondition on
 * availability (highRiskTransactionSuccessRate stays low while
 * protected — that's correct, not a defect), but an EQUALLY strict bar
 * on security: fraudControlStatus must literally equal
 * "bounded-fallback", which only the real bounded-fallback rules ever
 * set.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [{ key: "fraudControlStatus", operator: "equals", comparedTo: "bounded-fallback" }],
  sustainedSeconds: 20,
};

/**
 * Failure condition: a sustained, severe fraud-control compromise. If
 * cumulativeFraudReviewBypassCount is allowed to climb past 40 (i.e.
 * the candidate leaves a bypass lever active through the
 * sustained-surge escalation window) and stays there, the incident is
 * treated as an automatic failure — failure is never gated by
 * completion mode (tick.ts), so a candidate cannot simply decline to
 * Finish and wait out a live, worsening fraud-exposure violation.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "cumulativeFraudReviewBypassCount", operator: "greater_than_or_equal", comparedTo: 40 },
  ],
  sustainedSeconds: 45,
};
