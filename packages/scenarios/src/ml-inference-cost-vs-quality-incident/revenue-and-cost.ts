import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  CLASSIFIER_REMEDIATION_KEY,
  NON_CRITICAL_CACHE_REUSE_KEY,
  ROUTING_POLICY_KEY,
  SMALL_MODEL_QUALITY_FLOOR_KEY,
} from "./controls";

/**
 * Revenue loss here models BUSINESS RISK from a genuinely-happening
 * silent quality-critical downgrade, never classic downtime —
 * routingLayerUptimePercent and inferenceP99LatencyMs never move, by
 * design, so there is no availability-driven revenue loss to model in
 * the traditional sense. Every entry below is sized by how unsafe the
 * live quality-protection state is — the blanket-small-model-unprotected
 * family loses the MOST, despite having the best-looking (cheapest,
 * fastest) uptime/latency of any state in the scenario. Every genuinely
 * safe state (quality-tiering, blanket-large-model, protected
 * rollout/blanket-small) loses zero revenue regardless of how
 * cost-explosive it still is — cost is scored on its own axis
 * (costEfficiency), never conflated with customer-facing revenue risk.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-active-misroute": 0,
  "baseline-sustained-misroute": 0,
  "blanket-small-model-unprotected-active": 180,
  "blanket-small-model-unprotected-sustained": 420,
  "blanket-small-model-protected": 0,
  "quality-tiering-standard": 0,
  "quality-tiering-standard-cache": 0,
  "quality-tiering-enhanced": 0,
  "quality-tiering-enhanced-cache": 0,
  "classifier-fix-fully-rolled-out": 0,
  "classifier-fix-protected-rollout": 0,
  "classifier-fix-unprotected-just-dispatched": 120,
  "classifier-fix-unprotected-window1": 60,
  "blanket-large-model-sustained": 0,
};

/**
 * Baseline cost is authored to represent the scenario's STARTING,
 * already-elevated spend implied by the degraded classifier's traffic
 * mix once sustained (the baselineMonthlyUsd below, mirroring Cross-
 * Region Replication Cost Explosion's and Runaway Cloud Spend During
 * Healthy Traffic's identical convention, is anchored at the
 * SUSTAINED-misroute cost level, not the pre-incident level — every
 * reachable safe lever below only ever reduces spend below it). See
 * scoring.ts's doc comment for why costIncreaseRatio (peak vs. this
 * baseline) is therefore structurally unable to discriminate among
 * reachable states here, and the honest finalStringEquals workaround
 * used instead.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 12_600,
  perUnitMonthlyUsd: {
    [`${ROUTING_POLICY_KEY}:classifier-only`]: 0,
    // Quality-tiering's own routing cost is already reflected in the
    // rule-authored monthlyInferenceCostUsd display field; the generic
    // engine cost model below tracks the SAME real reduction via a
    // negative per-unit delta off the exploded baseline.
    [`${ROUTING_POLICY_KEY}:quality-tiering`]: -9_550,
    [`${ROUTING_POLICY_KEY}:blanket-small-model`]: -11_700,
    // Routing EVERY request to the Large Model is genuinely MORE
    // expensive than the already-inflated sustained-misroute baseline
    // (72% Large) — a real, honest "quality protected, cost never
    // addressed, in fact made worse" tradeoff, never a free lunch.
    [`${ROUTING_POLICY_KEY}:blanket-large-model`]: 1_900,
    [`${CLASSIFIER_REMEDIATION_KEY}:false`]: 0,
    // Real, ongoing cost of running a parallel remediation rollout
    // while it is in flight — modest relative to the inference-cost
    // swings above, but genuinely nonzero, so classifierRemediation is
    // never a free lever either.
    [`${CLASSIFIER_REMEDIATION_KEY}:true`]: 150,
    [`${SMALL_MODEL_QUALITY_FLOOR_KEY}:standard`]: 0,
    // Real, ongoing extra compute cost of running the Small Model at
    // its enhanced tier — a genuine cost/quality lever, never free.
    [`${SMALL_MODEL_QUALITY_FLOOR_KEY}:enhanced`]: 500,
    [`${NON_CRITICAL_CACHE_REUSE_KEY}:off`]: 0,
    // Cache-reuse infrastructure itself costs a small, real amount to
    // run, even though it SAVES far more in avoided inference calls
    // (reflected in the lower rule-authored monthlyInferenceCostUsd for
    // every "*-cache" state) — a genuine, non-free lever.
    [`${NON_CRITICAL_CACHE_REUSE_KEY}:on`]: 100,
  },
};

/**
 * successCondition (OPTIMAL): quality-critical traffic is fully
 * protected via a genuinely engaged, DELIBERATE mechanism (safetyBasis
 * = "deliberate-protection" — never merely "nothing has gone wrong
 * yet", see safetyBasis's doc comment in metrics.ts), that protection
 * is achieved through genuine per-request criticality judgment
 * (routingJudgmentBasis = "criticality-aware" — never a blanket policy
 * that happens to protect critical traffic only as a side effect of
 * sacrificing everyone else's quality uniformly, per the business
 * invariant "cost reduction must be achieved by smarter routing, not
 * blanket quality sacrifice"), AND cost is genuinely contained
 * (costStatus reads "cost-contained"). Reachable via either Path A
 * (classifier-fix-fully-rolled-out — the classifier itself is now
 * routing correctly again) or Path B (any quality-tiering variant) —
 * two genuinely different mechanisms both clearing the same bar.
 * blanket-large-model and blanket-small-model-protected satisfy the
 * quality-protection half but fail the routingJudgmentBasis gate (both
 * are "blanket" — no per-request criticality judgment was ever made);
 * blanket-small-model-protected additionally still reads
 * "cost-contained" yet correctly lands at ACCEPTABLE rather than
 * OPTIMAL purely on this gate, proving the distinction is real rather
 * than merely "cost happened to clear a number." mid-rollout protected
 * states fail both the judgment-basis gate (classifier is still
 * degraded, "classifier-degraded") and the cost gate.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "criticalTrafficSilentlyDowngradedPercent", operator: "equals", comparedTo: 0 },
    { key: "safetyBasis", operator: "equals", comparedTo: "deliberate-protection" },
    { key: "routingJudgmentBasis", operator: "equals", comparedTo: "criticality-aware" },
    { key: "costStatus", operator: "equals", comparedTo: "cost-contained" },
  ],
  sustainedSeconds: 30,
};

/**
 * acceptableCondition (ACCEPTABLE): the legitimate degraded-but-safe
 * tier this scenario explicitly supports — quality-critical traffic is
 * fully, DELIBERATELY protected (safetyBasis = "deliberate-protection"),
 * but the cost explosion itself has not yet been contained (costStatus
 * still reads "cost-explosive"). Covers blanket-large-model (quality
 * protected, cost never addressed at all), blanket-small-model-
 * protected (a cruder blanket policy that still protects critical
 * traffic but makes no per-request quality judgment for anyone else),
 * and classifier-fix-protected-rollout (quality protected immediately
 * via the pin, cost still draining until the classifier itself
 * genuinely catches up). Critically, this does NOT cover the
 * unmitigated classifier-only baseline, even though its live
 * qualityProtectionStatus also reads "protected" — baseline's
 * safetyBasis reads "unaddressed" (no deliberate mechanism was ever
 * engaged), so a zero-action attempt can never pass Finish at either
 * tier merely by having not yet triggered a visible downgrade.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "criticalTrafficSilentlyDowngradedPercent", operator: "equals", comparedTo: 0 },
    { key: "safetyBasis", operator: "equals", comparedTo: "deliberate-protection" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: cumulative silent-critical-downgrade exposure has run long
 * enough, at a severe enough rate, to constitute a catastrophic,
 * irrecoverable business-risk collapse within this attempt — not merely
 * "still unsafe." Gated on the cumulative count (a real, counted number
 * of actual quality-critical requests already silently downgraded), so
 * a brief accidental flip is not instantly fatal but a sustained
 * blanket-small-model-unprotected exposure window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "cumulativeSilentCriticalDowngradeCount", operator: "greater_than_or_equal", comparedTo: 500 }],
  sustainedSeconds: 30,
};
