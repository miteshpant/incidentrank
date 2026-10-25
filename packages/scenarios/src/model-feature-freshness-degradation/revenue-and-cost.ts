import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  FEATURE_REFRESH_POLICY_KEY,
  MODEL_QUALITY_TIER_KEY,
  MODEL_ROUTING_KEY,
} from "./controls";

/**
 * Revenue loss here models BUSINESS RISK from degraded/unsafe decision
 * quality, never classic downtime — modelServingUptimePercent and
 * decisionApiP99LatencyMs never move, by design, so there is no
 * availability-driven revenue loss to model in the traditional sense.
 * Every entry below is sized by how unsafe/degraded decisionQualityScore
 * and staleFeaturePercentOnCriticalDecisions are in that state — the
 * silent-permissive and offline-snapshot traps lose the MOST, despite
 * having the best-looking uptime/latency of any state in the scenario.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-lagging": 70,
  "baseline-sustained-lagging": 190,
  "silent-permissive-active": 90,
  "silent-permissive-sustained": 260,
  "offline-snapshot-critical-trap": 240,
  "fresh-fallback-full-quality": 15,
  "fresh-fallback-lightweight": 25,
  "bounded-protective-default-no-hold": 35,
  "held-just-engaged": 20,
  "draining-window1-held-balanced": 18,
  "draining-window1-held-prioritized": 12,
  "draining-window1-held-prioritized-aggressive-refresh": 8,
  "draining-window2-held-balanced": 8,
  "draining-window2-held-prioritized": 5,
  "fully-recovered-held-prioritized": 0,
  "fully-recovered-held-balanced": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 2_200,
  perUnitMonthlyUsd: {
    // Alternate Strong Path A's real ongoing compute cost — a second
    // model serving critical traffic at full quality costs real money
    // every month it stays engaged.
    [`${MODEL_ROUTING_KEY}:fresh-fallback`]: 650,
    [`${MODEL_QUALITY_TIER_KEY}:full`]: 300,
    // The direct cost-efficiency lever: recomputing features far more
    // often is a real, continuous infra spend.
    [`${FEATURE_REFRESH_POLICY_KEY}:aggressive`]: 420,
  },
};

/**
 * OPTIMAL: feature pipeline fully caught up (decisionQualityScore at its
 * authored healthy ceiling), zero stale critical decisions EVER served
 * (staleFeaturePercentOnCriticalDecisions = 0), and the summary string
 * states both read fully healthy/fresh. Reachable via EITHER alternate
 * strong path: fresh-fallback routing (immediate, since it never reads
 * the lagging store) or the held+bounded+prioritized path once its full
 * drain window has elapsed.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "decisionQualityScore", operator: "greater_than_or_equal", comparedTo: 85 },
    { key: "staleFeaturePercentOnCriticalDecisions", operator: "equals", comparedTo: 0 },
    { key: "freshnessStatus", operator: "equals", comparedTo: "fresh" },
    { key: "decisionRiskStatus", operator: "not_equals", comparedTo: "quality-compromised" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier this scenario
 * explicitly encourages (phase6e2.md's requirement that a bounded
 * fallback/hold may be preferable to serving stale high-quality
 * features) — zero stale critical decisions have EVER been served
 * (staleFeaturePercentOnCriticalDecisions = 0, decisionRiskStatus =
 * "safe-degraded"), but the pipeline has not fully drained OR a real,
 * deliberate quality/compute tradeoff (fresh-fallback, lightweight
 * tier, or held decisions) is still active.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "staleFeaturePercentOnCriticalDecisions", operator: "equals", comparedTo: 0 },
    { key: "decisionRiskStatus", operator: "equals", comparedTo: "safe-degraded" },
    { key: "freshnessStatus", operator: "equals", comparedTo: "fresh" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: cumulative stale-critical-decision exposure has run long
 * enough, at a severe enough rate, to constitute a catastrophic,
 * irrecoverable business-risk collapse within this attempt — not merely
 * "still degraded." Gated on the cumulative count (a real, counted
 * number of actual bad decisions already made), so a brief accidental
 * flip is not instantly fatal but a sustained silent/offline-snapshot
 * exposure window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "cumulativeStaleCriticalDecisionCount", operator: "greater_than_or_equal", comparedTo: 400 }],
  sustainedSeconds: 30,
};
