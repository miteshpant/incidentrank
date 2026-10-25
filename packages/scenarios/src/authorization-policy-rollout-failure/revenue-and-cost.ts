import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CACHE_INVALIDATION_KEY, POLICY_CACHE_TTL_SECONDS_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  baseline: 180,
  "widening-unfrozen": 440,
  "frozen-source-unfixed": 220,
  "emergency-deny-high-risk": 260,
  "fail-open-all": 10,
  "fail-open-all-sustained": 5,
  "emergency-allow-override": 60,
  "emergency-allow-override-sustained": 100,
  "source-fixed-unconverged": 90,
  "source-rolled-back-unconverged": 90,
  "safe-degraded-noncritical": 40,
  "converging-window1": 55,
  "converging-window2": 30,
  "converged-safe": 0,
  "converged-safe-historical-scar": 0,
  "passive-converging-short-ttl": 50,
  "passive-converged-long-ttl": 5,
  "staged-reexpansion": 35,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_200,
  perUnitMonthlyUsd: {
    [`${CACHE_INVALIDATION_KEY}:invalidating`]: 220,
    [`${POLICY_CACHE_TTL_SECONDS_KEY}:30`]: 140,
  },
};

/**
 * OPTIMAL: cache convergence fully complete (cacheConvergencePercent =
 * 100, fleetVersionSkewStatus = "converged"), the source policy fixed
 * (rolloutPolicyVersion = "v1-pinned-good"), zero false-denies/zero
 * unauthorized grants, and enforcement explicitly fail-closed-all —
 * only reachable via converged-safe-pinned, converged-safe-rolled-back,
 * or converged-safe-with-historical-unauthorized-access in rules.ts,
 * each of which requires the full convergence window to have genuinely
 * elapsed with active invalidation engaged. The historical-scar variant
 * satisfies this same objective condition — cumulativeUnauthorizedAccessCount
 * is NOT part of successCondition, by design: whether unsafe access
 * happened earlier in the attempt is a permanent scar recorded for
 * scoring (dataIntegrity), never a gate on whether the CURRENT
 * configuration is safe to hand back.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "cacheConvergencePercent", operator: "equals", comparedTo: 100 },
    { key: "fleetVersionSkewStatus", operator: "equals", comparedTo: "converged" },
    { key: "falseDenyRatePercent", operator: "less_than_or_equal", comparedTo: 0.5 },
    { key: "unauthorizedGrantRatePercent", operator: "equals", comparedTo: 0 },
    { key: "enforcementPosture", operator: "equals", comparedTo: "fail-closed-all" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier — fail-open-
 * noncritical engaged as a deliberate, bounded tradeoff while
 * convergence is still in progress. unauthorizedGrantRatePercent must
 * still be exactly 0 (protected/critical resources remain fail-closed
 * the entire time, per business invariant #5) — this tier differs from
 * OPTIMAL only in accepting a real, bounded, non-zero false-deny rate
 * and incomplete convergence, never in accepting any unauthorized
 * access. Reachable from safe-degraded-noncritical only.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "unauthorizedGrantRatePercent", operator: "equals", comparedTo: 0 },
    { key: "enforcementPosture", operator: "equals", comparedTo: "fail-open-noncritical" },
    { key: "falseDenyRatePercent", operator: "less_than_or_equal", comparedTo: 2 },
    { key: "authorizationStatus", operator: "equals", comparedTo: "safe-degraded" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: unauthorized access has been granted long enough, at a
 * severe enough rate, to constitute a catastrophic, irrecoverable
 * security collapse within this attempt — not merely "still degraded."
 * Gated on the cumulative count (a real, counted number of actual
 * unauthorized grants), not merely the instantaneous rate, so a brief
 * accidental flip is not instantly fatal but a sustained fail-open-all
 * window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "cumulativeUnauthorizedAccessCount", operator: "greater_than_or_equal", comparedTo: 800 },
  ],
  sustainedSeconds: 30,
};
