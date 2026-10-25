import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How a missing or stale feature value is handled at read time. "strict"
 * (default) refuses to silently serve a feature value past its intended
 * freshness bound — the read is explicitly flagged stale and the
 * decision pipeline downstream (staleFeatureCutoff / criticalDecisionHold)
 * gets an honest signal that something is stale. "permissive" instead
 * fills the gap with whatever value is currently cached, however old,
 * with no flag at all — Model Serving keeps returning normal-looking
 * responses and Decision API keeps succeeding, but CRITICAL decisions
 * can now be silently computed from arbitrarily stale features with
 * nothing downstream ever finding out. This is the scenario's root
 * unsafe lever: it requires no scaling, no capacity change, and no
 * visible failure anywhere to do real, cumulative decision-quality
 * damage (see rules.ts's "silent-permissive-*" family and
 * cumulativeStaleCriticalDecisionCount in metrics.ts).
 */
export const FEATURE_FALLBACK_MODE_KEY = "featureFallbackMode";

/**
 * Where Model Serving routes inference traffic. "primary" (default)
 * always uses the full-quality model against whatever the Feature Store
 * currently holds — correct once the Feature Store is fresh, but during
 * the incident this is exactly what keeps critical decisions bound to
 * aging features unless staleFeatureCutoff/criticalDecisionHold are also
 * engaged. "fresh-fallback" routes to a separate, lower-quality model
 * that only reads a small, independently-fresh feature subset (never the
 * lagging Feature Store) — ALTERNATE STRONG PATH A: trading full model
 * quality for a hard freshness guarantee, genuinely safe for critical
 * decisions even while the Feature Pipeline is still behind.
 */
export const MODEL_ROUTING_KEY = "modelRouting";

/**
 * Hard ceiling on how old a feature value may be before it is refused
 * for serving, independent of featureFallbackMode. "unbounded" (default)
 * applies no ceiling at all — any feature, however old, is eligible to
 * be read. "bounded" refuses any feature older than the authored
 * freshness bound outright, forcing a fallback/hold decision instead of
 * silently serving it. This is the second half (with
 * featureFallbackMode=strict) of what makes the root unsafe lever
 * visible and blockable rather than silent.
 */
export const STALE_FEATURE_CUTOFF_KEY = "staleFeatureCutoff";

/**
 * Whether CRITICAL decisions are held (queued, not answered from
 * untrusted features) once feature staleness has crossed the bound,
 * while lower-risk traffic continues normally. "off" (default) never
 * holds anything — every decision, critical or not, is answered
 * immediately from whatever features are currently available. "on"
 * holds only CRITICAL decisions once staleness crosses the authored
 * bound, releasing them once genuinely fresh features (or a fresh-
 * fallback/offline-safe path) are available — ALTERNATE STRONG PATH B:
 * never touches low-risk traffic, measurably protects decision quality
 * at a real, bounded cost (held critical-decision volume), and requires
 * no model change at all.
 */
export const CRITICAL_DECISION_HOLD_KEY = "criticalDecisionHold";

/**
 * Which feature classes the Feature Pipeline computes first while it is
 * behind. "balanced" (default) computes every feature class in arrival
 * order with no deliberate preference — under backlog, this lets
 * critical-decision feature classes age exactly as fast as everything
 * else. "critical-features-first" reorders computation so the feature
 * classes feeding CRITICAL decisions are refreshed ahead of bulk/
 * low-risk feature classes whenever the pipeline is behind — a genuine,
 * third accelerant for exactly the features that matter most, at the
 * real cost of bulk feature freshness lagging further behind than it
 * otherwise would.
 */
export const PIPELINE_PRIORITY_KEY = "pipelinePriority";

/**
 * How often the Feature Pipeline recomputes feature values from Source
 * Data. "normal" (default) is sized for ordinary load — insufficient
 * once the pipeline has fallen behind. "aggressive" recomputes far more
 * often, genuinely draining pipeline lag faster — but at a real,
 * continuous infrastructure cost increase (see revenue-and-cost.ts),
 * making this the scenario's primary direct cost-efficiency lever: it
 * trades money for faster freshness recovery, independent of which
 * routing/hold strategy is chosen.
 */
export const FEATURE_REFRESH_POLICY_KEY = "featureRefreshPolicy";

/**
 * Whether Model Serving may fill a missing live feature from a daily
 * batch-computed offline snapshot rather than from the live Feature
 * Store. "off" (default) never does this. "on" looks like a free,
 * elegant fix for feature-store gaps — no extra compute, no held
 * decisions, no model change — but the offline snapshot is, by
 * construction, computed once a day: using it for a CRITICAL decision
 * is not "degraded-but-bounded," it is substituting data that can
 * already be a full day stale for data this scenario requires be
 * current within a short authored bound. This is the scenario's second,
 * independent unsafe trap (distinct from featureFallbackMode=permissive
 * — see rules.ts's "offline-snapshot-critical-trap"), proving the trap
 * is not only reachable through one specific lever.
 */
export const OFFLINE_SNAPSHOT_USE_KEY = "offlineSnapshotUse";

/**
 * Quality tier Model Serving runs when modelRouting is "fresh-fallback".
 * "full" (default) keeps the fresh-fallback model at full quality — more
 * compute, more cost, the strongest version of Alternate Strong Path A.
 * "lightweight" runs a cheaper, smaller fresh-fallback model — still
 * fully fresh (it never reads the lagging Feature Store either way) but
 * a real, deliberate quality/cost tradeoff within that same alternate
 * path, never a correctness violation by itself. Has no effect while
 * modelRouting is "primary".
 */
export const MODEL_QUALITY_TIER_KEY = "modelQualityTier";

export const controls: ControlDefinition[] = [
  {
    key: FEATURE_FALLBACK_MODE_KEY,
    allowedValues: ["strict", "permissive"],
    initialValue: "strict",
  },
  {
    key: MODEL_ROUTING_KEY,
    allowedValues: ["primary", "fresh-fallback"],
    initialValue: "primary",
  },
  {
    key: STALE_FEATURE_CUTOFF_KEY,
    allowedValues: ["unbounded", "bounded"],
    initialValue: "unbounded",
  },
  {
    key: CRITICAL_DECISION_HOLD_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: PIPELINE_PRIORITY_KEY,
    allowedValues: ["balanced", "critical-features-first"],
    initialValue: "balanced",
  },
  {
    key: FEATURE_REFRESH_POLICY_KEY,
    allowedValues: ["normal", "aggressive"],
    initialValue: "normal",
  },
  {
    key: OFFLINE_SNAPSHOT_USE_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: MODEL_QUALITY_TIER_KEY,
    allowedValues: ["full", "lightweight"],
    initialValue: "full",
  },
];
