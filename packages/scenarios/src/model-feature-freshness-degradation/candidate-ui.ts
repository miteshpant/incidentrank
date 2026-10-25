import type { CandidateUIDescriptor } from "../candidate-ui";
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

export const modelFeatureFreshnessDegradationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "modelServingUptimePercent", label: "Model Serving Uptime", sourceStateKey: "modelServingUptimePercent", format: "percentage" },
    { key: "decisionApiP99LatencyMs", label: "Decision API P99 Latency", sourceStateKey: "decisionApiP99LatencyMs", format: "duration" },
    { key: "featurePipelineLagSeconds", label: "Feature Pipeline Lag", sourceStateKey: "featurePipelineLagSeconds", format: "duration" },
    { key: "featureFreshnessAgeSeconds", label: "Served Feature Age", sourceStateKey: "featureFreshnessAgeSeconds", format: "duration" },
    { key: "featureStoreAvailabilityPercent", label: "Feature Store Availability", sourceStateKey: "featureStoreAvailabilityPercent", format: "percentage" },
    { key: "decisionQualityScore", label: "Decision Quality Score", sourceStateKey: "decisionQualityScore", format: "number" },
    { key: "staleFeaturePercent", label: "Stale Feature Rate (All Decisions)", sourceStateKey: "staleFeaturePercent", format: "percentage" },
    { key: "staleFeaturePercentOnCriticalDecisions", label: "Stale Feature Rate (Critical Decisions)", sourceStateKey: "staleFeaturePercentOnCriticalDecisions", format: "percentage" },
    { key: "criticalDecisionVolumePerMinute", label: "Critical Decision Volume / min", sourceStateKey: "criticalDecisionVolumePerMinute", format: "number" },
    { key: "fallbackModelUsagePercent", label: "Fresh-Fallback Model Usage", sourceStateKey: "fallbackModelUsagePercent", format: "percentage" },
    { key: "criticalDecisionsHeldPerMinute", label: "Critical Decisions Held / min", sourceStateKey: "criticalDecisionsHeldPerMinute", format: "number" },
    { key: "cumulativeStaleCriticalDecisionCount", label: "Cumulative Stale Critical Decisions (historical)", sourceStateKey: "cumulativeStaleCriticalDecisionCount", format: "number" },
    { key: "freshnessStatus", label: "Freshness Status", sourceStateKey: "freshnessStatus", format: "status" },
    { key: "decisionRiskStatus", label: "Decision Risk Status", sourceStateKey: "decisionRiskStatus", format: "status" },
  ],
  controls: [
    {
      key: FEATURE_FALLBACK_MODE_KEY,
      label: "Feature Fallback Mode",
      componentId: "feature-store",
      valueLabels: { strict: "Strict (flag stale reads)", permissive: "Permissive (silently fill from cache)" },
    },
    {
      key: STALE_FEATURE_CUTOFF_KEY,
      label: "Stale Feature Cutoff",
      componentId: "feature-store",
      valueLabels: { unbounded: "Unbounded", bounded: "Bounded (refuse past SLO)" },
    },
    {
      key: CRITICAL_DECISION_HOLD_KEY,
      label: "Critical Decision Hold",
      componentId: "decision-api",
      valueLabels: { false: "Off", true: "Hold Critical Decisions When Stale" },
    },
    {
      key: MODEL_ROUTING_KEY,
      label: "Model Routing",
      componentId: "model-serving",
      valueLabels: { primary: "Primary Model", "fresh-fallback": "Fresh-Fallback Model" },
    },
    {
      key: MODEL_QUALITY_TIER_KEY,
      label: "Model Quality Tier",
      componentId: "model-serving",
      valueLabels: { full: "Full Quality", lightweight: "Lightweight" },
    },
    {
      key: PIPELINE_PRIORITY_KEY,
      label: "Pipeline Priority",
      componentId: "feature-pipeline",
      valueLabels: { balanced: "Balanced", "critical-features-first": "Critical Features First" },
    },
    {
      key: FEATURE_REFRESH_POLICY_KEY,
      label: "Feature Refresh Policy",
      componentId: "feature-pipeline",
      valueLabels: { normal: "Normal", aggressive: "Aggressive" },
    },
    {
      key: OFFLINE_SNAPSHOT_USE_KEY,
      label: "Offline Snapshot Use",
      componentId: "feature-store",
      valueLabels: { false: "Off", true: "Use Offline Snapshot On Gaps" },
    },
  ],
  components: [
    { id: "source-data", label: "Source Data" },
    { id: "feature-pipeline", label: "Feature Pipeline" },
    { id: "feature-store", label: "Feature Store" },
    { id: "model-serving", label: "Model Serving" },
    { id: "decision-api", label: "Decision API" },
  ],
};
