import type { ScenarioDefinition } from "./types";
import {
  modelFeatureFreshnessDegradationSimulation,
  CRITICAL_DECISION_HOLD_KEY,
  FEATURE_FALLBACK_MODE_KEY,
  FEATURE_REFRESH_POLICY_KEY,
  MODEL_QUALITY_TIER_KEY,
  MODEL_ROUTING_KEY,
  OFFLINE_SNAPSHOT_USE_KEY,
  PIPELINE_PRIORITY_KEY,
  STALE_FEATURE_CUTOFF_KEY,
} from "./model-feature-freshness-degradation/definition";
import { modelFeatureFreshnessDegradationCandidateUI } from "./model-feature-freshness-degradation/candidate-ui";
import { MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING } from "./model-feature-freshness-degradation/scoring";

/**
 * Model Feature Freshness Degradation — a paid, Principal-level
 * IncidentRank scenario (Phase 6E.2). The Feature Pipeline falls behind
 * real-time, so the Feature Store serves progressively staler feature
 * values — but Model Serving uptime and Decision API latency stay
 * green throughout. This is a DECISION-QUALITY problem, not an
 * availability problem: the model keeps returning responses
 * successfully while the trustworthiness of those responses degrades,
 * and nothing about serving health signals it.
 */
export const modelFeatureFreshnessDegradation: ScenarioDefinition = {
  id: "model-feature-freshness-degradation",
  slug: "model-feature-freshness-degradation",
  version: 1,
  name: "Model Feature Freshness Degradation",
  description:
    "The Feature Pipeline has fallen behind real-time: the Feature Store is serving progressively staler feature values, but Model Serving uptime and Decision API latency remain fully healthy throughout. The model keeps returning responses successfully while the decision quality of those responses silently degrades. Five business invariants govern every decision here: (1) decision quality must remain above the authored safety/business threshold; (2) serving stale features beyond the allowed bound is not acceptable even if latency is perfect; (3) a bounded fallback model or feature set may be preferable to using stale high-quality features; (4) model-serving uptime is not the primary objective; (5) critical decisions may need to be delayed or downgraded rather than made from untrusted features. Decide whether to route critical traffic to a fresh-but-lower-quality fallback model, hold critical decisions while bounded-stale low-risk traffic continues, reprioritize which feature classes the pipeline recovers first, and whether the extra compute spend of faster recovery or a fresher fallback is worth it versus a slower, cheaper drain.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  simulation: modelFeatureFreshnessDegradationSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "Feature Freshness",
      "Model Serving",
      "Decision Quality",
      "ML Platform",
      "Historical Damage",
      "Cost Efficiency",
    ],
    skills: [
      "Distinguishing model-serving availability from decision-quality risk",
      "Recognizing that healthy uptime/latency can mask a silent correctness problem",
      "Choosing between a fresh-but-lower-quality fallback and holding critical decisions",
      "Weighing the ongoing cost of faster feature-pipeline recovery against a slower, cheaper drain",
    ],
    shortDescription:
      "Feature freshness degrades while model-serving uptime stays perfectly healthy — silently serving stale features to critical decisions looks free but is genuinely unsafe.",
  },
};

export {
  modelFeatureFreshnessDegradationSimulation,
  modelFeatureFreshnessDegradationCandidateUI,
  MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
  CRITICAL_DECISION_HOLD_KEY,
  FEATURE_FALLBACK_MODE_KEY,
  FEATURE_REFRESH_POLICY_KEY,
  MODEL_QUALITY_TIER_KEY,
  MODEL_ROUTING_KEY,
  OFFLINE_SNAPSHOT_USE_KEY,
  PIPELINE_PRIORITY_KEY,
  STALE_FEATURE_CUTOFF_KEY,
};
