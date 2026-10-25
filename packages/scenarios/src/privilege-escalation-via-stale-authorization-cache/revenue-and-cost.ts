import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CACHE_INVALIDATION_MODE_KEY, CACHE_TTL_SECONDS_KEY, POLICY_STORE_READ_MODE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "fail-closed-baseline": 170,
  "fail-closed-baseline-sustained": 230,
  "broad-trust-all-reintroduces-staleness": 190,
  "fail-open-stale-grant": 15,
  "fail-open-stale-grant-sustained": 5,
  "fail-open-stale-grant-during-convergence": 8,
  "broad-trust-all-fail-open-compounded": 10,
  "safe-degraded-source-of-truth-required": 70,
  "assumed-converged-unverified": 30,
  "converging-window1": 90,
  "converging-window2": 45,
  "converged-safe": 0,
  "passive-converging-short-ttl": 85,
  "passive-converged-long-ttl": 10,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 900,
  perUnitMonthlyUsd: {
    [`${CACHE_INVALIDATION_MODE_KEY}:immediate`]: 110,
    [`${CACHE_INVALIDATION_MODE_KEY}:forced`]: 180,
    [`${CACHE_TTL_SECONDS_KEY}:30`]: 90,
    [`${POLICY_STORE_READ_MODE_KEY}:source-of-truth-required`]: 60,
  },
};

/**
 * OPTIMAL: cache convergence fully complete (cacheConvergencePercent =
 * 100, fleetCacheConvergenceStatus = "converged"), zero stale grants,
 * enforcement explicitly fail-closed, AND convergence explicitly
 * verified before being broadly trusted again — only reachable via
 * converged-safe-verified in rules.ts, which requires the full
 * convergence window to have genuinely elapsed with
 * convergenceVerification = "verify-before-trust" engaged. Reachable
 * via EITHER alternate strong path (immediate/forced invalidation OR a
 * targeted purge), since the rule's `when` never constrains which
 * propagation lever was used.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "cacheConvergencePercent", operator: "equals", comparedTo: 100 },
    { key: "fleetCacheConvergenceStatus", operator: "equals", comparedTo: "converged" },
    { key: "staleGrantRatePercent", operator: "equals", comparedTo: 0 },
    { key: "enforcementPosture", operator: "equals", comparedTo: "fail-closed" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier — policyStoreReadMode
 * = "source-of-truth-required" engaged as a deliberate, bounded
 * availability tradeoff while convergence is still in progress.
 * staleGrantRatePercent must still be exactly 0 (every decision is
 * double-checked directly against the Policy Store, so correctness is
 * never in doubt) — this tier differs from OPTIMAL only in accepting a
 * real, deliberate availability cost and incomplete fleet convergence,
 * never in accepting any stale grant. Reachable from
 * safe-degraded-source-of-truth-required only.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "staleGrantRatePercent", operator: "equals", comparedTo: 0 },
    { key: "authorizationStatus", operator: "equals", comparedTo: "safe-degraded" },
    { key: "enforcementPosture", operator: "equals", comparedTo: "fail-closed" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: stale-grant exposure has been granted long enough, at a
 * severe enough rate, to constitute a catastrophic, irrecoverable
 * security collapse within this attempt — not merely "still
 * unconverged." Gated on the cumulative count (a real, counted number
 * of actual stale grants), not merely the instantaneous rate, so a
 * brief accidental flip is not instantly fatal but a sustained
 * fail-open window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "cumulativeStalePrivilegeGrantCount", operator: "greater_than_or_equal", comparedTo: 600 },
  ],
  sustainedSeconds: 30,
};
