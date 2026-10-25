import type { ActionClassificationRule } from "@incidentrank/simulator";
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

export const actionClassifications: ActionClassificationRule[] = [
  // ── featureFallbackMode ────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: FEATURE_FALLBACK_MODE_KEY,
    valueEquals: "permissive",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "harmful",
    feedback: {
      title: "Permissive fallback silently served arbitrarily stale features to critical decisions",
      explanation:
        "Switching feature-fallback handling to permissive made every visible serving metric look identical to the safe paths — Model Serving uptime and Decision API latency never moved. That apparent calm is not real: permissive mode fills a missing or stale feature value with whatever is currently cached, however old, with no flag anywhere downstream. Combined with an unbounded staleness cutoff, this let critical decisions be computed from badly stale features with nothing in the system ever surfacing it. Every tick this stayed active added to a permanent, non-resetting count of stale critical decisions, which stays on the record even after you revert to strict mode, and materially penalizes Data Integrity and Reliability regardless of how healthy serving looked.",
    },
  },
  {
    id: "acc_2",
    controlKey: FEATURE_FALLBACK_MODE_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Strict fallback mode made feature staleness visible instead of silent",
      explanation:
        "Keeping feature-fallback handling at strict means a stale or missing feature read is explicitly flagged rather than quietly filled in — decisionRiskStatus correctly reports quality-compromised instead of a false healthy reading whenever a critical decision is still exposed to stale data. This does not, by itself, stop the exposure (staleFeatureCutoff is what actually blocks the stale read) — but it is a required precondition for every real remediation to even be possible, since nothing downstream can protect against a risk it cannot see.",
    },
  },

  // ── staleFeatureCutoff ───────────────────────────────────────────────
  {
    id: "acc_3",
    controlKey: STALE_FEATURE_CUTOFF_KEY,
    valueEquals: "bounded",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Bounded cutoff refused to serve critical decisions from features past the freshness bound",
      explanation:
        "Enforcing a hard staleness ceiling means any feature older than the authored bound is refused outright for serving, forcing either a genuine hold (criticalDecisionHold) or a safe protective-default answer instead of a guess from untrusted data. This is the real lever (not featureFallbackMode alone) that drives staleFeaturePercentOnCriticalDecisions to zero — a required ingredient of both this scenario's acceptable and optimal tiers.",
    },
  },
  {
    id: "acc_4",
    controlKey: STALE_FEATURE_CUTOFF_KEY,
    valueEquals: "unbounded",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "harmful",
    feedback: {
      title: "Unbounded cutoff let critical decisions keep reading arbitrarily old features",
      explanation:
        "Leaving staleFeatureCutoff unbounded means no feature age is ever too old to serve — critical decisions keep being answered from whatever the Feature Store currently holds, no matter how far behind the Feature Pipeline has fallen. This is unsafe regardless of how the other serving metrics look, and is the required precondition that makes featureFallbackMode's permissive/strict choice matter at all.",
    },
  },

  // ── criticalDecisionHold ─────────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: CRITICAL_DECISION_HOLD_KEY,
    valueEquals: true,
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Holding critical decisions traded a bounded delay for guaranteed decision correctness",
      explanation:
        "Holding only CRITICAL decisions once staleness crosses the bound — while leaving low-risk traffic fully untouched — is one of this scenario's two legitimate alternate strong paths. It adds a real, visible held-decision cost (criticalDecisionsHeldPerMinute) for as long as the pipeline is behind, but it never risks answering a critical decision from untrusted data, and the held decisions are released as the pipeline genuinely catches up.",
    },
  },
  {
    id: "acc_6",
    controlKey: CRITICAL_DECISION_HOLD_KEY,
    valueEquals: false,
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the hold disengaged relies on the bounded cutoff's protective default instead",
      explanation:
        "With criticalDecisionHold off, a critical decision whose features exceed the staleness bound is never held — it falls through to a safe protective-default answer instead (as long as staleFeatureCutoff is bounded). This avoids a held-decision backlog entirely, at the real cost of lower accuracy on exactly the decisions that would otherwise have waited for fresh data. Not unsafe by itself, but it is a different tradeoff from holding, not a strictly better one.",
    },
  },

  // ── modelRouting ─────────────────────────────────────────────────────
  {
    id: "acc_7",
    controlKey: MODEL_ROUTING_KEY,
    valueEquals: "fresh-fallback",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Fresh-fallback routing protected decision quality without waiting for the pipeline to recover",
      explanation:
        "Routing critical decisions to a separate model that only reads an independently-fresh feature subset — never the lagging Feature Store — is this scenario's other legitimate alternate strong path. It protects decision quality immediately, with no drain lag to wait out, at the real cost of lower model quality on exactly the traffic it protects and a real ongoing compute cost for as long as it stays engaged (see modelQualityTier).",
    },
  },
  {
    id: "acc_8",
    controlKey: MODEL_ROUTING_KEY,
    valueEquals: "primary",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "neutral",
    feedback: {
      title: "Staying on the primary model keeps full model quality, but keeps critical decisions bound to the Feature Store",
      explanation:
        "The primary model is the right choice once the Feature Store is fresh, and remaining on it is not itself unsafe — but during this incident it means critical-decision quality depends entirely on staleFeatureCutoff/criticalDecisionHold actually being engaged. Staying on primary without also protecting the cutoff is what leaves critical decisions exposed to stale data.",
    },
  },

  // ── modelQualityTier ─────────────────────────────────────────────────
  {
    id: "acc_9",
    controlKey: MODEL_QUALITY_TIER_KEY,
    valueEquals: "full",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Full-quality fresh-fallback preserved the strongest version of the fresh-routing path",
      explanation:
        "Running the fresh-fallback model at full quality (only meaningful once modelRouting is fresh-fallback) keeps decision quality as close as possible to the primary model's ceiling while still guaranteeing freshness — the strongest version of Alternate Strong Path A, at a real, higher ongoing compute cost than the lightweight tier.",
    },
  },
  {
    id: "acc_10",
    controlKey: MODEL_QUALITY_TIER_KEY,
    valueEquals: "lightweight",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "neutral",
    feedback: {
      title: "Lightweight fresh-fallback traded some decision quality for lower ongoing compute cost",
      explanation:
        "Running the fresh-fallback model at the lightweight tier (only meaningful once modelRouting is fresh-fallback) is still fully fresh — it never reads the lagging Feature Store either way — but genuinely scores lower on decisionQualityScore than the full tier. A real, honest cost/quality tradeoff within an already-safe path, never a correctness violation by itself.",
    },
  },

  // ── pipelinePriority ─────────────────────────────────────────────────
  {
    id: "acc_11",
    controlKey: PIPELINE_PRIORITY_KEY,
    valueEquals: "critical-features-first",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Prioritizing critical feature classes accelerated recovery of exactly what matters most",
      explanation:
        "Reordering Feature Pipeline computation so critical-decision feature classes are refreshed ahead of bulk/low-risk classes genuinely speeds how fast decisionQualityScore recovers under the held/bounded safe path, at the real cost of bulk feature freshness lagging further behind than it otherwise would. A real, non-dead accelerant on top of the hold-based alternate path.",
    },
  },
  {
    id: "acc_12",
    controlKey: PIPELINE_PRIORITY_KEY,
    valueEquals: "balanced",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "neutral",
    feedback: {
      title: "Balanced computation order treats every feature class identically under backlog",
      explanation:
        "Leaving pipeline priority balanced computes every feature class in arrival order with no deliberate preference — safe as long as the bounded cutoff and/or hold are engaged, but it leaves real, avoidable recovery time on the table for the feature classes that actually feed critical decisions.",
    },
  },

  // ── featureRefreshPolicy ─────────────────────────────────────────────
  {
    id: "acc_13",
    controlKey: FEATURE_REFRESH_POLICY_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Aggressive refresh spent real money to drain pipeline lag faster",
      explanation:
        "Recomputing features far more often genuinely shortens how long the Feature Pipeline stays behind, on top of whichever safe routing/hold strategy is in effect — but it is a real, continuous infrastructure cost increase for as long as it stays engaged, not a free accelerant. Worth it when draining faster matters more than the added monthly spend; not required to reach a safe state on its own.",
    },
  },
  {
    id: "acc_14",
    controlKey: FEATURE_REFRESH_POLICY_KEY,
    valueEquals: "normal",
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "neutral",
    feedback: {
      title: "Normal refresh cadence avoids the extra spend but drains lag more slowly",
      explanation:
        "Leaving featureRefreshPolicy at normal is fine as long as a real safe path (bounded cutoff + hold, or fresh-fallback routing) is already protecting critical decisions — it simply means the underlying pipeline lag itself takes longer to fully drain, without the extra ongoing compute cost aggressive refresh would add.",
    },
  },

  // ── offlineSnapshotUse ───────────────────────────────────────────────
  {
    id: "acc_15",
    controlKey: OFFLINE_SNAPSHOT_USE_KEY,
    valueEquals: true,
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "harmful",
    feedback: {
      title: "Offline snapshot use substituted up-to-a-day-stale data into critical decisions",
      explanation:
        "Filling feature gaps from a once-daily offline snapshot looks like a free, elegant fix — no extra compute, no held decisions, no model change — but the snapshot is computed once a day by construction. Using it for a CRITICAL decision can mean answering from data that is already a full day stale, which this scenario never accepts regardless of how it affects uptime or latency. This is an independent unsafe trap from permissive fallback mode, and accrues the same permanent, non-resetting stale-decision exposure count.",
    },
  },
  {
    id: "acc_16",
    controlKey: OFFLINE_SNAPSHOT_USE_KEY,
    valueEquals: false,
    whenTriggerEquals: { pipelineLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Leaving offline-snapshot use off avoided substituting day-old batch data into live decisions",
      explanation:
        "Never falling back to the offline snapshot keeps every critical decision bound to either genuinely fresh live features, a genuinely fresh fallback model, or a held/protective-default answer — never a once-daily batch computation standing in for live data on CRITICAL traffic.",
    },
  },
];
