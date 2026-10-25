import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CRITICAL_DECISION_HOLD_KEY,
  FEATURE_FALLBACK_MODE_KEY,
  FEATURE_REFRESH_POLICY_KEY,
  MODEL_QUALITY_TIER_KEY,
  MODEL_ROUTING_KEY,
  OFFLINE_SNAPSHOT_USE_KEY,
  PIPELINE_PRIORITY_KEY,
  STALE_FEATURE_CUTOFF_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "source-data": "healthy",
  "feature-pipeline": "healthy",
  "feature-store": "healthy",
  "model-serving": "healthy",
  "decision-api": "healthy",
};

// Model Serving and Decision API NEVER leave "healthy" in this
// scenario, in any rule, including every unsafe one — the entire
// Principal-level point is that uptime/latency never signal the
// problem. Only Feature Pipeline / Feature Store health communicates
// severity.
const laggingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "feature-pipeline": "degraded",
  "feature-store": "degraded",
};

const laggingCriticalHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "feature-pipeline": "critical",
  "feature-store": "critical",
};

const silentUnsafeHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "feature-pipeline": "critical",
  "feature-store": "critical",
};

const draininHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "feature-pipeline": "degraded",
  "feature-store": "degraded",
};

/**
 * Authored rule table for Model Feature Freshness Degradation, ordered
 * most-specific-first (first-match-wins, top-to-bottom). Correctness-
 * violation traps are checked first, then the two independent alternate
 * strong paths (fresh-fallback routing; critical-decision hold +
 * pipeline priority + aggressive refresh), then the baseline/no-
 * mitigation family.
 *
 * ROOT CAUSE: the Feature Pipeline begins falling behind real-time
 * (pipelineLagging). modelServingUptimePercent and
 * decisionApiP99LatencyMs never move in ANY rule below — this must
 * never look like a generic latency/availability incident. The visible
 * symptoms are entirely in feature freshness and decision-quality
 * fields: featurePipelineLagSeconds, featureFreshnessAgeSeconds,
 * decisionQualityScore, staleFeaturePercent(OnCriticalDecisions).
 *
 * CENTRAL JUDGMENT (business invariants #1/#2/#4/#5, phase6e2.md): a
 * critical decision must never be silently computed from features past
 * the authored staleness bound, regardless of how healthy serving looks.
 * staleFeatureCutoff="bounded" is what actually prevents this on the
 * primary model: once engaged, any critical decision whose features
 * exceed the bound is refused stale data outright — either genuinely
 * held (criticalDecisionHold=true) or safely deferred to a protective
 * default answer (criticalDecisionHold=false) — either way,
 * staleFeaturePercentOnCriticalDecisions stays 0. Leaving the cutoff
 * "unbounded" (the default) keeps answering critical decisions from
 * whatever age feature is available: featureFallbackMode="strict" at
 * least visibly FLAGS this (decisionRiskStatus reads
 * "quality-compromised", never silently "healthy"), while
 * featureFallbackMode="permissive" makes it silent AND accrues
 * cumulativeStaleCriticalDecisionCount — the scenario's required
 * minimum-cost-looks-great-but-unsafe trap (requirement 4): zero extra
 * compute, zero held decisions, modelServingUptimePercent/
 * decisionApiP99LatencyMs identical to every safe path, yet the single
 * worst dataIntegrity/reliability outcome in the entire scenario.
 *
 * REQUIRED ALTERNATE STRONG PATHS (phase6e2.md):
 *   A. modelRouting="fresh-fallback" — routes CRITICAL decisions to a
 *      separate, lower-quality model that reads only an independently-
 *      fresh feature subset, never the lagging Feature Store. This
 *      protects decision quality IMMEDIATELY (no drain lag — there is
 *      structurally nothing to wait for), at the real cost of lower
 *      model quality on exactly the traffic it protects, and a real
 *      ongoing compute cost (modelQualityTier="full" vs "lightweight").
 *   B. criticalDecisionHold=true (+staleFeatureCutoff="bounded") — holds
 *      CRITICAL decisions once staleness crosses the bound, releasing
 *      them once the Feature Pipeline itself has genuinely caught up
 *      (real elapsed drain time, pipelinePriority genuinely accelerates
 *      it). Low-risk traffic is never touched.
 *   C. pipelinePriority="critical-features-first" (accelerant, not a
 *      standalone path) — genuinely speeds how fast critical feature
 *      classes specifically recover, provable against "balanced" at an
 *      equivalent elapsed time.
 *
 * COST-EFFICIENCY AS A FIRST-CLASS AXIS (requirement 1): two genuinely
 * safe paths — A (fresh-fallback, ongoing extra model-serving compute)
 * and B (hold + drain, zero extra serving compute, a real but bounded
 * availability cost on critical decisions only) — reach materially
 * different cost outcomes while both being fully safe. featureRefresh
 * Policy="aggressive" is a further, independent cost lever on top of
 * either path (real ongoing pipeline compute cost, faster drain).
 *
 * NO SCALE-X-OVERLOAD-Y MECHANIC: nothing in this scenario scales a
 * service and then overloads a downstream dependency. Every lever here
 * either reroutes traffic (A), defers/holds specific decisions (B),
 * reprioritizes existing compute (C), or spends real money on refresh
 * cadence — none of them create a NEW bottleneck elsewhere. This is one
 * of this batch's required >=3 scenarios with no such mechanic.
 */
export const modelFeatureFreshnessDegradationRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAPS — checked first: win regardless of every
  // other control, because a decision-quality violation on CRITICAL
  // traffic is never acceptable however healthy serving looks.
  // ══════════════════════════════════════════════════════════════════

  // Silent-permissive, sustained: the scenario's primary required trap.
  // Zero compute cost, zero held decisions, uptime/latency identical to
  // every safe path — yet critical decisions are silently answered from
  // badly stale features with no flag anywhere.
  {
    id: "silent-permissive-sustained",
    when: {
      triggerEquals: { pipelineLagging: true, sustainedLag: true },
      controlEquals: {
        [FEATURE_FALLBACK_MODE_KEY]: "permissive",
        [STALE_FEATURE_CUTOFF_KEY]: "unbounded",
      },
    },
    incidentState: "silent-permissive-sustained",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 260,
      featureFreshnessAgeSeconds: 420,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 38,
      staleFeaturePercent: 55,
      staleFeaturePercentOnCriticalDecisions: 60,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 420,
      freshnessStatus: "critical-at-risk",
      decisionRiskStatus: "quality-compromised-silent",
      decisionQualitySeverity: "critical",
    },
    componentHealth: silentUnsafeHealth,
  },
  {
    id: "silent-permissive-active",
    when: {
      triggerEquals: { pipelineLagging: true },
      controlEquals: {
        [FEATURE_FALLBACK_MODE_KEY]: "permissive",
        [STALE_FEATURE_CUTOFF_KEY]: "unbounded",
      },
    },
    incidentState: "silent-permissive-active",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 90,
      featureFreshnessAgeSeconds: 140,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 62,
      staleFeaturePercent: 30,
      staleFeaturePercentOnCriticalDecisions: 32,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 90,
      freshnessStatus: "critical-at-risk",
      decisionRiskStatus: "quality-compromised-silent",
      decisionQualitySeverity: "critical",
    },
    componentHealth: silentUnsafeHealth,
  },

  // Offline-snapshot critical trap: an INDEPENDENT unsafe lever. Even
  // with featureFallbackMode="strict" and staleFeatureCutoff="bounded"
  // (the otherwise-safe combination), routing gaps to a once-daily
  // offline snapshot for CRITICAL decisions substitutes data that can
  // already be a full day stale — this is never acceptable for
  // CRITICAL traffic, proving the trap is not reachable through only
  // one specific control.
  {
    id: "offline-snapshot-critical-trap",
    when: {
      triggerEquals: { pipelineLagging: true, sustainedLag: true },
      controlEquals: { [OFFLINE_SNAPSHOT_USE_KEY]: true },
    },
    incidentState: "offline-snapshot-critical-trap",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 90,
      featurePipelineLagSeconds: 260,
      featureFreshnessAgeSeconds: 420,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 45,
      staleFeaturePercent: 50,
      staleFeaturePercentOnCriticalDecisions: 48,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 340,
      freshnessStatus: "critical-at-risk",
      decisionRiskStatus: "quality-compromised-silent",
      decisionQualitySeverity: "critical",
    },
    componentHealth: silentUnsafeHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH A — fresh-fallback model routing. Protects
  // decision quality IMMEDIATELY (no drain lag) because this model
  // never reads the lagging Feature Store at all. Listed before the
  // generic unmitigated baseline and before Path B so it is recognized
  // as a fully independent route to safety.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "fresh-fallback-full-quality",
    when: {
      triggerEquals: { pipelineLagging: true },
      controlEquals: { [MODEL_ROUTING_KEY]: "fresh-fallback", [MODEL_QUALITY_TIER_KEY]: "full" },
    },
    incidentState: "fresh-fallback-full-quality",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 95,
      featurePipelineLagSeconds: 90,
      featureFreshnessAgeSeconds: 140,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 88,
      staleFeaturePercent: 30,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 100,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "safe-degraded",
      decisionQualitySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "fresh-fallback-lightweight",
    when: {
      triggerEquals: { pipelineLagging: true },
      controlEquals: { [MODEL_ROUTING_KEY]: "fresh-fallback", [MODEL_QUALITY_TIER_KEY]: "lightweight" },
    },
    incidentState: "fresh-fallback-lightweight",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 80,
      featurePipelineLagSeconds: 90,
      featureFreshnessAgeSeconds: 140,
      featureStoreAvailabilityPercent: 100,
      // Lower quality than the full-tier fresh-fallback — a real,
      // honest cost/quality tradeoff within the SAME alternate path,
      // never a correctness violation (still 0 stale critical decisions).
      decisionQualityScore: 76,
      staleFeaturePercent: 30,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 100,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "safe-degraded",
      decisionQualitySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH B — bounded cutoff + critical-decision hold.
  // staleFeaturePercentOnCriticalDecisions is held at 0 by construction
  // (a critical decision needing stale data is held, not answered), but
  // overall decisionQualityScore only recovers as the Feature Pipeline
  // itself genuinely catches up — real elapsed drain time, accelerated
  // by pipelinePriority/featureRefreshPolicy. Listed before the bare
  // "bounded, hold off" protective-default rule since it is more
  // specific (also constrains criticalDecisionHold).
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: full recovery. Bounded cutoff + hold engaged + critical-
  // features-first + fully elapsed drain window — pipeline caught up,
  // held decisions released, zero stale critical decisions throughout.
  {
    id: "fully-recovered-held-prioritized",
    when: {
      triggerEquals: { pipelineLagging: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [STALE_FEATURE_CUTOFF_KEY]: "bounded",
        [CRITICAL_DECISION_HOLD_KEY]: true,
        [PIPELINE_PRIORITY_KEY]: "critical-features-first",
      },
    },
    incidentState: "fully-recovered-held-prioritized",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 3,
      featureFreshnessAgeSeconds: 8,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 99,
      staleFeaturePercent: 0,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "healthy",
      decisionQualitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: full recovery, balanced priority. Same trigger gate as
  // fully-recovered-held-prioritized above (bounded cutoff + hold
  // engaged + fully elapsed drain window — pipelinePriority plays no
  // part in whether the drain window itself has elapsed, only in how
  // fast it got there), but pipelinePriority stays at its default
  // "balanced" instead of "critical-features-first". Without this rule,
  // this exact state combination previously fell through every
  // pipelinePriority-gated rule below (all of which require either
  // "critical-features-first" explicitly, or "balanced" explicitly
  // combined with drainWindowFullyRecoveredElapsed: false) all the way
  // to baseline-sustained-lagging — silently re-flagging a genuinely
  // safe, fully-drained state as the worst unmitigated baseline purely
  // from elapsed time, with zero candidate action in between. A real,
  // honest decisionQualityScore gap vs. the prioritized ceiling (99) is
  // preserved here (consistent with every other balanced/prioritized
  // pair in this table), but it is still a fully safe, fully recovered
  // terminal state: zero stale critical decisions, zero held decisions,
  // decisionRiskStatus "healthy".
  {
    id: "fully-recovered-held-balanced",
    when: {
      triggerEquals: { pipelineLagging: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [STALE_FEATURE_CUTOFF_KEY]: "bounded",
        [CRITICAL_DECISION_HOLD_KEY]: true,
        [PIPELINE_PRIORITY_KEY]: "balanced",
      },
    },
    incidentState: "fully-recovered-held-balanced",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 5,
      featureFreshnessAgeSeconds: 12,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 95,
      staleFeaturePercent: 0,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "healthy",
      decisionQualitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE tiers: hold engaged, bounded cutoff, draining but not
  // yet fully recovered — some critical decisions are currently held
  // (a real, bounded, DECLARED cost), zero are being silently served
  // stale.
  {
    id: "draining-window2-held-prioritized",
    when: {
      triggerEquals: {
        pipelineLagging: true,
        sustainedLag: true,
        drainWindow2Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [STALE_FEATURE_CUTOFF_KEY]: "bounded",
        [CRITICAL_DECISION_HOLD_KEY]: true,
        [PIPELINE_PRIORITY_KEY]: "critical-features-first",
      },
    },
    incidentState: "draining-window2-held-prioritized",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 20,
      featureFreshnessAgeSeconds: 35,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 92,
      staleFeaturePercent: 8,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 2,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "safe-degraded",
      decisionQualitySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window2-held-balanced",
    when: {
      triggerEquals: {
        pipelineLagging: true,
        sustainedLag: true,
        drainWindow2Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [STALE_FEATURE_CUTOFF_KEY]: "bounded",
        [CRITICAL_DECISION_HOLD_KEY]: true,
        [PIPELINE_PRIORITY_KEY]: "balanced",
      },
    },
    incidentState: "draining-window2-held-balanced",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 35,
      featureFreshnessAgeSeconds: 60,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 88,
      staleFeaturePercent: 14,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 5,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "safe-degraded",
      decisionQualitySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  // Aggressive refresh policy on top of the held+bounded+prioritized
  // path: a real, independent cost lever (see revenue-and-cost.ts's
  // perUnitMonthlyUsd) that genuinely accelerates recovery AT THE SAME
  // elapsed drain window — proving featureRefreshPolicy is not a dead
  // control, same pattern as Data Pipeline Freshness Collapse's
  // lowPriorityIngestionThrottle distinguishing its own draining-window
  // rules. Listed before the plain (non-aggressive) window-1 rule since
  // it is more specific (also constrains featureRefreshPolicy).
  {
    id: "draining-window1-held-prioritized-aggressive-refresh",
    when: {
      triggerEquals: {
        pipelineLagging: true,
        sustainedLag: true,
        drainWindow1Elapsed: true,
        drainWindow2Elapsed: false,
      },
      controlEquals: {
        [STALE_FEATURE_CUTOFF_KEY]: "bounded",
        [CRITICAL_DECISION_HOLD_KEY]: true,
        [PIPELINE_PRIORITY_KEY]: "critical-features-first",
        [FEATURE_REFRESH_POLICY_KEY]: "aggressive",
      },
    },
    incidentState: "draining-window1-held-prioritized-aggressive-refresh",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 30,
      featureFreshnessAgeSeconds: 50,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 90,
      staleFeaturePercent: 10,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 3,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "safe-degraded",
      decisionQualitySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window1-held-prioritized",
    when: {
      triggerEquals: {
        pipelineLagging: true,
        sustainedLag: true,
        drainWindow1Elapsed: true,
        drainWindow2Elapsed: false,
      },
      controlEquals: {
        [STALE_FEATURE_CUTOFF_KEY]: "bounded",
        [CRITICAL_DECISION_HOLD_KEY]: true,
        [PIPELINE_PRIORITY_KEY]: "critical-features-first",
      },
    },
    incidentState: "draining-window1-held-prioritized",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 55,
      featureFreshnessAgeSeconds: 95,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 84,
      staleFeaturePercent: 20,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 6,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "safe-degraded",
      decisionQualitySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window1-held-balanced",
    when: {
      triggerEquals: {
        pipelineLagging: true,
        sustainedLag: true,
        drainWindow1Elapsed: true,
        drainWindow2Elapsed: false,
      },
      controlEquals: {
        [STALE_FEATURE_CUTOFF_KEY]: "bounded",
        [CRITICAL_DECISION_HOLD_KEY]: true,
        [PIPELINE_PRIORITY_KEY]: "balanced",
      },
    },
    incidentState: "draining-window1-held-balanced",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 80,
      featureFreshnessAgeSeconds: 130,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 78,
      staleFeaturePercent: 26,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 9,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "safe-degraded",
      decisionQualitySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ── Just-engaged tick-zero proof: hold flipped this instant (no
  // elapsed drain window yet) — held-decision volume is exactly what it
  // is at the moment the hold started, proving the drain is not instant.
  {
    id: "held-just-engaged",
    when: {
      triggerEquals: { pipelineLagging: true, sustainedLag: true, drainWindow1Elapsed: false },
      controlEquals: { [STALE_FEATURE_CUTOFF_KEY]: "bounded", [CRITICAL_DECISION_HOLD_KEY]: true },
    },
    incidentState: "held-just-engaged",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 260,
      featureFreshnessAgeSeconds: 420,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 70,
      staleFeaturePercent: 55,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 24,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "safe-degraded",
      decisionQualitySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ── Bounded cutoff, hold OFF: a critical decision needing stale data
  // is never silently answered from it (bounded refuses the stale read
  // outright) — instead it is safely deferred to a protective default
  // answer. This is genuinely safe (zero stale critical decisions,
  // zero held-decision cost either) but at a real, bounded accuracy
  // cost on exactly the decisions that would otherwise have been held —
  // a legitimate, cheaper (no held-decision backlog) but lower-quality-
  // on-affected-traffic variant of the safe family, never a correctness
  // violation.
  {
    id: "bounded-protective-default-no-hold",
    when: {
      triggerEquals: { pipelineLagging: true, sustainedLag: true },
      controlEquals: { [STALE_FEATURE_CUTOFF_KEY]: "bounded", [CRITICAL_DECISION_HOLD_KEY]: false },
    },
    incidentState: "bounded-protective-default-no-hold",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 260,
      featureFreshnessAgeSeconds: 420,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 73,
      staleFeaturePercent: 55,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "safe-degraded",
      decisionQualitySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // NO MITIGATION — staleFeatureCutoff left "unbounded" with
  // featureFallbackMode="strict" (visibly flagged, but still genuinely
  // served to critical decisions). Not the silent trap above (strict
  // flags it honestly), but still a real, unaddressed decision-quality
  // violation the candidate has not protected against.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-lagging",
    when: { triggerEquals: { pipelineLagging: true, sustainedLag: true } },
    incidentState: "baseline-sustained-lagging",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 260,
      featureFreshnessAgeSeconds: 420,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 42,
      staleFeaturePercent: 55,
      staleFeaturePercentOnCriticalDecisions: 58,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 310,
      freshnessStatus: "critical-at-risk",
      decisionRiskStatus: "quality-compromised",
      decisionQualitySeverity: "critical",
    },
    componentHealth: laggingCriticalHealth,
  },
  {
    id: "baseline-lagging",
    when: { triggerEquals: { pipelineLagging: true } },
    incidentState: "baseline-lagging",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 90,
      featureFreshnessAgeSeconds: 140,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 68,
      staleFeaturePercent: 30,
      staleFeaturePercentOnCriticalDecisions: 32,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 70,
      freshnessStatus: "critical-at-risk",
      decisionRiskStatus: "quality-compromised",
      decisionQualitySeverity: "warning",
    },
    componentHealth: laggingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      modelServingUptimePercent: 99.95,
      decisionApiP99LatencyMs: 85,
      featurePipelineLagSeconds: 0,
      featureFreshnessAgeSeconds: 5,
      featureStoreAvailabilityPercent: 100,
      decisionQualityScore: 100,
      staleFeaturePercent: 0,
      staleFeaturePercentOnCriticalDecisions: 0,
      criticalDecisionVolumePerMinute: 40,
      fallbackModelUsagePercent: 0,
      criticalDecisionsHeldPerMinute: 0,
      cumulativeStaleCriticalDecisionCount: 0,
      freshnessStatus: "fresh",
      decisionRiskStatus: "healthy",
      decisionQualitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
