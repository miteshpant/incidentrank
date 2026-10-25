import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CLASSIFIER_REMEDIATION_KEY,
  CRITICAL_SEGMENT_POLICY_KEY,
  NON_CRITICAL_CACHE_REUSE_KEY,
  ROUTING_POLICY_KEY,
  SMALL_MODEL_QUALITY_FLOOR_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  requests: "healthy",
  "routing-layer": "healthy",
  "large-model": "healthy",
  "small-model": "healthy",
  "feature-store": "healthy",
};

// Routing Layer / Large Model / Small Model / Feature Store NEVER leave
// "healthy" in this scenario, in any rule, including every unsafe one —
// the entire Principal-level point is that availability never signals
// the problem. Only cost and quality-protection fields communicate
// severity.
const misroutedHealth: Record<string, ComponentHealth> = { ...healthyHealth };

/**
 * Authored rule table for ML Inference Cost vs Quality Incident, ordered
 * most-specific-first (first-match-wins, top-to-bottom). The unsafe
 * correctness trap is checked first, then the two independent alternate
 * strong paths (Path A: fix the classifier itself; Path B: explicit
 * quality-tiering policy), then the honest "quality protected, cost
 * unaddressed" blanket-large-model family, then the unmitigated
 * classifier-only baseline.
 *
 * ROOT CAUSE: the upstream request-complexity classifier degrades
 * (misrouteActive), so the Routing Layer's default "classifier-only"
 * policy sends far more traffic to the Large Model than genuinely
 * necessary. routingLayerUptimePercent and inferenceP99LatencyMs never
 * move in ANY rule below — this must never look like an availability
 * incident. The visible symptoms are entirely in traffic-mix/cost and
 * decision-quality-protection fields.
 *
 * CENTRAL JUDGMENT (business invariants, see definition.ts): a quality-
 * critical request must never be silently downgraded to the Small Model
 * without an explicit, bounded policy decision, and cost reduction must
 * be achieved by smarter routing, not blanket quality sacrifice.
 * criticalSegmentPolicy="always-large-model" OR routingPolicy=
 * "quality-tiering" are what actually keep
 * criticalTrafficSilentlyDowngradedPercent at 0. routingPolicy=
 * "blanket-small-model" with criticalSegmentPolicy left "unprotected"
 * (the default) is the scenario's required minimum-cost-looks-great-
 * but-unsafe trap (requirement 6): inference cost collapses to near
 * zero immediately, routingLayerUptimePercent/inferenceP99LatencyMs
 * identical to every safe path, yet it silently downgrades EVERY
 * request including quality-critical ones, accruing a permanent,
 * non-resetting cumulativeSilentCriticalDowngradeCount.
 *
 * REQUIRED ALTERNATE STRONG PATHS (phase6e3.md):
 *   A. classifierRemediation=true with routingPolicy left at its
 *      default "classifier-only" — repairs the ACTUAL broken
 *      classifier rather than overriding its decisions. Durable: once
 *      fully rolled out (real elapsed time, see timed-events.ts), every
 *      future routing decision is trustworthy again with no ongoing
 *      policy-maintenance cost. Slower (a genuine recovery-lag drain
 *      window, with real, honest, bounded exposure while the classifier
 *      is still degraded, UNLESS criticalSegmentPolicy is also pinned
 *      as defense-in-depth during the rollout).
 *   B. routingPolicy="quality-tiering" — an explicit, candidate-
 *      authored policy that routes by each request's own declared
 *      criticality tag, independent of the classifier's health
 *      entirely. Immediate: safe and cost-contained the instant it is
 *      engaged, no drain lag, because it never consults the broken
 *      classifier's verdict at all. Requires the candidate to actively
 *      maintain this policy rather than fixing the underlying
 *      classifier — a real, ongoing judgment call, not a free lunch.
 *
 * DEFAULT-VALUE PATH COMPLETENESS (phase6e3.md's binding #90-regression
 * requirement): Path B's safety is structural to quality-tiering itself
 * (it routes critical traffic to the Large Model by definition) — the
 * terminal safe rule for Path B is gated ONLY on routingPolicy, NEVER
 * additionally constraining criticalSegmentPolicy, so leaving that pin
 * at its default "unprotected" while running quality-tiering still
 * reaches a genuinely safe terminal state. Path A's fully-rolled-out
 * terminal rule is likewise gated ONLY on
 * {routingPolicy:"classifier-only", classifierRemediation:true,
 * classifierFixFullyRolledOut:true} — NEVER additionally constraining
 * criticalSegmentPolicy — because once the classifier is genuinely
 * fixed, routing decisions are correct regardless of whether the
 * redundant pin was ever engaged. See
 * ml-inference-cost-vs-quality-incident.test.ts's dedicated "default-
 * value path completeness" suite for the regression proof.
 *
 * NO SCALE-X-OVERLOAD-Y MECHANIC: nothing here scales a service and then
 * overloads a downstream dependency. Every lever either reroutes traffic
 * by policy (A, B), repairs a classifier (A), or spends/saves real money
 * on model tier and cache reuse — none of them create a NEW bottleneck
 * elsewhere.
 */
export const mlInferenceCostVsQualityIncidentRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAP — checked first: wins regardless of every
  // other control, because a quality-critical request silently served
  // by the Small Model is never acceptable however cheap or available
  // serving looks.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "blanket-small-model-unprotected-sustained",
    when: {
      triggerEquals: { misrouteActive: true, sustainedMisroute: true },
      controlEquals: {
        [ROUTING_POLICY_KEY]: "blanket-small-model",
        [CRITICAL_SEGMENT_POLICY_KEY]: "unprotected",
      },
    },
    incidentState: "blanket-small-model-unprotected-sustained",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 0,
      smallModelTrafficSharePercent: 100,
      monthlyInferenceCostUsd: 900,
      criticalTrafficOnLargeModelPercent: 0,
      criticalTrafficSilentlyDowngradedPercent: 100,
      averageResponseQualityScore: 48,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 540,
      costStatus: "cost-contained",
      qualityProtectionStatus: "silently-downgraded",
      safetyBasis: "unaddressed",
      routingJudgmentBasis: "blanket",
      qualityRiskSeverity: "critical",
    },
    componentHealth: misroutedHealth,
  },
  {
    id: "blanket-small-model-unprotected-active",
    when: {
      triggerEquals: { misrouteActive: true },
      controlEquals: {
        [ROUTING_POLICY_KEY]: "blanket-small-model",
        [CRITICAL_SEGMENT_POLICY_KEY]: "unprotected",
      },
    },
    incidentState: "blanket-small-model-unprotected-active",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 0,
      smallModelTrafficSharePercent: 100,
      monthlyInferenceCostUsd: 900,
      criticalTrafficOnLargeModelPercent: 0,
      criticalTrafficSilentlyDowngradedPercent: 100,
      averageResponseQualityScore: 48,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 90,
      costStatus: "cost-contained",
      qualityProtectionStatus: "silently-downgraded",
      safetyBasis: "unaddressed",
      routingJudgmentBasis: "blanket",
      qualityRiskSeverity: "critical",
    },
    componentHealth: misroutedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // DEFENSE-IN-DEPTH: blanket-small-model WITH the critical-segment pin
  // engaged. Critical traffic is genuinely protected (the pin forces it
  // to the Large Model regardless of routingPolicy), but non-critical
  // traffic is blanket-downgraded with no per-request judgment at all —
  // a cruder, less defensible policy than quality-tiering, but not a
  // correctness violation. A legitimate ACCEPTABLE tier, materially
  // distinct from OPTIMAL (no explicit criticality-based judgment was
  // actually made for non-critical traffic, it was simply never looked
  // at), listed before the unprotected trap's broader fallback is
  // irrelevant here since controlEquals already fully disambiguates.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "blanket-small-model-protected",
    when: {
      triggerEquals: { misrouteActive: true },
      controlEquals: {
        [ROUTING_POLICY_KEY]: "blanket-small-model",
        [CRITICAL_SEGMENT_POLICY_KEY]: "always-large-model",
      },
    },
    incidentState: "blanket-small-model-protected",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 30,
      smallModelTrafficSharePercent: 70,
      monthlyInferenceCostUsd: 2_650,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 80,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-contained",
      qualityProtectionStatus: "protected",
      safetyBasis: "deliberate-protection",
      routingJudgmentBasis: "blanket",
      qualityRiskSeverity: "normal",
    },
    componentHealth: misroutedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH B — explicit quality-tiering policy. Safe and
  // cost-contained IMMEDIATELY (no drain lag — it never consults the
  // broken classifier at all). Gated ONLY on routingPolicy — never
  // additionally constraining criticalSegmentPolicy — because routing
  // by declared criticality is what quality-tiering means by
  // construction. This is the scenario's required default-value-
  // completeness proof for Path B.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "quality-tiering-enhanced-cache",
    when: {
      triggerEquals: { misrouteActive: true },
      controlEquals: {
        [ROUTING_POLICY_KEY]: "quality-tiering",
        [SMALL_MODEL_QUALITY_FLOOR_KEY]: "enhanced",
        [NON_CRITICAL_CACHE_REUSE_KEY]: "on",
      },
    },
    incidentState: "quality-tiering-enhanced-cache",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 30,
      smallModelTrafficSharePercent: 70,
      monthlyInferenceCostUsd: 3_050,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 95,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 62,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-contained",
      qualityProtectionStatus: "protected",
      safetyBasis: "deliberate-protection",
      routingJudgmentBasis: "criticality-aware",
      qualityRiskSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "quality-tiering-enhanced",
    when: {
      triggerEquals: { misrouteActive: true },
      controlEquals: {
        [ROUTING_POLICY_KEY]: "quality-tiering",
        [SMALL_MODEL_QUALITY_FLOOR_KEY]: "enhanced",
      },
    },
    incidentState: "quality-tiering-enhanced",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 30,
      smallModelTrafficSharePercent: 70,
      monthlyInferenceCostUsd: 3_550,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 94,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-contained",
      qualityProtectionStatus: "protected",
      safetyBasis: "deliberate-protection",
      routingJudgmentBasis: "criticality-aware",
      qualityRiskSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "quality-tiering-standard-cache",
    when: {
      triggerEquals: { misrouteActive: true },
      controlEquals: {
        [ROUTING_POLICY_KEY]: "quality-tiering",
        [NON_CRITICAL_CACHE_REUSE_KEY]: "on",
      },
    },
    incidentState: "quality-tiering-standard-cache",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 30,
      smallModelTrafficSharePercent: 70,
      monthlyInferenceCostUsd: 2_550,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 91,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 62,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-contained",
      qualityProtectionStatus: "protected",
      safetyBasis: "deliberate-protection",
      routingJudgmentBasis: "criticality-aware",
      qualityRiskSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  // ── Pure Path B, every "extra" control left at its untouched default
  // (smallModelQualityFloor="standard", nonCriticalCacheReuse="off").
  // This is the exact combination the default-value-path-completeness
  // audit requires be checked: Path B's own strategy description
  // mentions only routingPolicy="quality-tiering" (optionally with the
  // criticalSegmentPolicy pin, which has no additional effect here) —
  // it says nothing about the other three controls, and this rule must
  // still be reached rather than falling through to baseline.
  {
    id: "quality-tiering-standard",
    when: {
      triggerEquals: { misrouteActive: true },
      controlEquals: { [ROUTING_POLICY_KEY]: "quality-tiering" },
    },
    incidentState: "quality-tiering-standard",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 30,
      smallModelTrafficSharePercent: 70,
      monthlyInferenceCostUsd: 3_050,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 90,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-contained",
      qualityProtectionStatus: "protected",
      safetyBasis: "deliberate-protection",
      routingJudgmentBasis: "criticality-aware",
      qualityRiskSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH A — classifier remediation (root-cause fix).
  // Gated on routingPolicy staying "classifier-only" (the fix has
  // nothing to improve once a different policy stops consulting the
  // classifier at all) and classifierRemediation=true.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: fully rolled out. Gated ONLY on
  // {routingPolicy:"classifier-only", classifierRemediation:true,
  // classifierFixFullyRolledOut:true} — NEVER additionally constraining
  // criticalSegmentPolicy. This is the scenario's required default-
  // value-completeness proof for Path A: once the classifier is
  // genuinely fixed, routing decisions are correct regardless of
  // whether the redundant pin was ever engaged, so leaving
  // criticalSegmentPolicy at its default "unprotected" must still reach
  // this genuinely safe terminal state rather than falling through to
  // the unmitigated baseline purely from elapsed time.
  {
    id: "classifier-fix-fully-rolled-out",
    when: {
      triggerEquals: { misrouteActive: true, classifierFixFullyRolledOut: true },
      controlEquals: { [ROUTING_POLICY_KEY]: "classifier-only", [CLASSIFIER_REMEDIATION_KEY]: true },
    },
    incidentState: "classifier-fix-fully-rolled-out",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 32,
      smallModelTrafficSharePercent: 68,
      monthlyInferenceCostUsd: 3_200,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 96,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 100,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-contained",
      qualityProtectionStatus: "protected",
      safetyBasis: "deliberate-protection",
      routingJudgmentBasis: "criticality-aware",
      qualityRiskSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── Protected mid-rollout: criticalSegmentPolicy pinned as defense-
  // in-depth WHILE the classifier fix is still rolling out. Zero live
  // exposure throughout (ACCEPTABLE: quality fully protected), but cost
  // stays elevated until the classifier itself genuinely catches up —
  // a real, honest distinction from the fully-rolled-out OPTIMAL state
  // above. Listed before the unprotected-rollout family since it is
  // more specific (also constrains criticalSegmentPolicy).
  {
    id: "classifier-fix-protected-rollout",
    when: {
      triggerEquals: { misrouteActive: true, classifierFixFullyRolledOut: false },
      controlEquals: {
        [ROUTING_POLICY_KEY]: "classifier-only",
        [CLASSIFIER_REMEDIATION_KEY]: true,
        [CRITICAL_SEGMENT_POLICY_KEY]: "always-large-model",
      },
    },
    incidentState: "classifier-fix-protected-rollout",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 48,
      smallModelTrafficSharePercent: 52,
      monthlyInferenceCostUsd: 5_400,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 88,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 55,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-explosive",
      qualityProtectionStatus: "protected",
      safetyBasis: "deliberate-protection",
      routingJudgmentBasis: "classifier-degraded",
      qualityRiskSeverity: "normal",
    },
    componentHealth: misroutedHealth,
  },

  // ── Unprotected rollout, window 1 elapsed: real, honest, partial
  // exposure reduction as the classifier itself genuinely improves —
  // still a live violation (not yet zero), still UNSAFE, but
  // meaningfully less severe than the just-dispatched tick-zero state
  // below. Listed before the just-dispatched rule since it is more
  // specific (also constrains classifierFixWindow1Elapsed=true).
  {
    id: "classifier-fix-unprotected-window1",
    when: {
      triggerEquals: {
        misrouteActive: true,
        sustainedMisroute: true,
        classifierFixWindow1Elapsed: true,
        classifierFixFullyRolledOut: false,
      },
      controlEquals: {
        [ROUTING_POLICY_KEY]: "classifier-only",
        [CLASSIFIER_REMEDIATION_KEY]: true,
        [CRITICAL_SEGMENT_POLICY_KEY]: "unprotected",
      },
    },
    incidentState: "classifier-fix-unprotected-window1",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 50,
      smallModelTrafficSharePercent: 50,
      monthlyInferenceCostUsd: 5_600,
      criticalTrafficOnLargeModelPercent: 82,
      criticalTrafficSilentlyDowngradedPercent: 18,
      averageResponseQualityScore: 78,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 55,
      cumulativeSilentCriticalDowngradeCount: 140,
      costStatus: "cost-explosive",
      qualityProtectionStatus: "silently-downgraded",
      safetyBasis: "unaddressed",
      routingJudgmentBasis: "classifier-degraded",
      qualityRiskSeverity: "warning",
    },
    componentHealth: misroutedHealth,
  },

  // ── Unprotected rollout, just dispatched (tick-zero proof): the fix
  // was just engaged this instant — exposure is exactly the unmitigated
  // level, proving the rollout is not instant.
  {
    id: "classifier-fix-unprotected-just-dispatched",
    when: {
      triggerEquals: { misrouteActive: true, classifierFixWindow1Elapsed: false },
      controlEquals: {
        [ROUTING_POLICY_KEY]: "classifier-only",
        [CLASSIFIER_REMEDIATION_KEY]: true,
        [CRITICAL_SEGMENT_POLICY_KEY]: "unprotected",
      },
    },
    incidentState: "classifier-fix-unprotected-just-dispatched",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 62,
      smallModelTrafficSharePercent: 38,
      monthlyInferenceCostUsd: 7_200,
      criticalTrafficOnLargeModelPercent: 68,
      criticalTrafficSilentlyDowngradedPercent: 32,
      averageResponseQualityScore: 70,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 5,
      cumulativeSilentCriticalDowngradeCount: 30,
      costStatus: "cost-explosive",
      qualityProtectionStatus: "silently-downgraded",
      safetyBasis: "unaddressed",
      routingJudgmentBasis: "classifier-degraded",
      qualityRiskSeverity: "critical",
    },
    componentHealth: misroutedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // HONEST "QUALITY PROTECTED, COST UNADDRESSED" FAMILY — routing
  // everything to the Large Model never risks a correctness violation
  // (nothing is ever downgraded), but contains none of the cost
  // explosion at all. Gated only on routingPolicy — the critical-
  // segment pin and classifier health are irrelevant once every request
  // already gets the Large Model.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "blanket-large-model-sustained",
    when: {
      triggerEquals: { misrouteActive: true },
      controlEquals: { [ROUTING_POLICY_KEY]: "blanket-large-model" },
    },
    incidentState: "blanket-large-model-sustained",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 100,
      smallModelTrafficSharePercent: 0,
      monthlyInferenceCostUsd: 14_500,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 99,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-explosive",
      qualityProtectionStatus: "protected",
      safetyBasis: "deliberate-protection",
      routingJudgmentBasis: "blanket",
      qualityRiskSeverity: "normal",
    },
    componentHealth: misroutedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // NO MITIGATION — classifier-only left at its default, no
  // remediation dispatched. Not a silent trap (nothing is ever
  // DOWNGRADED relative to what the broken classifier itself decided —
  // the classifier still sends every request somewhere, correctly or
  // not), but a real, unaddressed, compounding cost exposure the
  // candidate has not protected against.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-misroute",
    when: { triggerEquals: { misrouteActive: true, sustainedMisroute: true } },
    incidentState: "baseline-sustained-misroute",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 72,
      smallModelTrafficSharePercent: 28,
      monthlyInferenceCostUsd: 12_600,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 97,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-explosive",
      qualityProtectionStatus: "protected",
      safetyBasis: "unaddressed",
      routingJudgmentBasis: "classifier-degraded",
      qualityRiskSeverity: "normal",
    },
    componentHealth: misroutedHealth,
  },
  {
    id: "baseline-active-misroute",
    when: { triggerEquals: { misrouteActive: true } },
    incidentState: "baseline-active-misroute",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 62,
      smallModelTrafficSharePercent: 38,
      monthlyInferenceCostUsd: 7_200,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 97,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-explosive",
      qualityProtectionStatus: "protected",
      safetyBasis: "unaddressed",
      routingJudgmentBasis: "classifier-degraded",
      qualityRiskSeverity: "normal",
    },
    componentHealth: misroutedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      routingLayerUptimePercent: 99.97,
      inferenceP99LatencyMs: 180,
      largeModelTrafficSharePercent: 35,
      smallModelTrafficSharePercent: 65,
      monthlyInferenceCostUsd: 4_500,
      criticalTrafficOnLargeModelPercent: 100,
      criticalTrafficSilentlyDowngradedPercent: 0,
      averageResponseQualityScore: 97,
      criticalRequestVolumePerMinute: 30,
      cacheReuseHitRatePercent: 0,
      classifierRemediationProgressPercent: 0,
      cumulativeSilentCriticalDowngradeCount: 0,
      costStatus: "cost-contained",
      qualityProtectionStatus: "protected",
      safetyBasis: "deliberate-protection",
      routingJudgmentBasis: "criticality-aware",
      qualityRiskSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
