import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CLASSIFIER_REMEDIATION_KEY,
  CRITICAL_SEGMENT_POLICY_KEY,
  NON_CRITICAL_CACHE_REUSE_KEY,
  ROUTING_POLICY_KEY,
  SMALL_MODEL_QUALITY_FLOOR_KEY,
} from "./controls";

export const mlInferenceCostVsQualityIncidentCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "routingLayerUptimePercent", label: "Routing Layer Uptime", sourceStateKey: "routingLayerUptimePercent", format: "percentage" },
    { key: "inferenceP99LatencyMs", label: "Inference P99 Latency", sourceStateKey: "inferenceP99LatencyMs", format: "duration" },
    { key: "largeModelTrafficSharePercent", label: "Large Model Traffic Share", sourceStateKey: "largeModelTrafficSharePercent", format: "percentage" },
    { key: "smallModelTrafficSharePercent", label: "Small Model Traffic Share", sourceStateKey: "smallModelTrafficSharePercent", format: "percentage" },
    { key: "monthlyInferenceCostUsd", label: "Monthly Inference Cost", sourceStateKey: "monthlyInferenceCostUsd", format: "currency" },
    { key: "criticalTrafficOnLargeModelPercent", label: "Critical Traffic on Large Model", sourceStateKey: "criticalTrafficOnLargeModelPercent", format: "percentage" },
    { key: "criticalTrafficSilentlyDowngradedPercent", label: "Critical Traffic Silently Downgraded", sourceStateKey: "criticalTrafficSilentlyDowngradedPercent", format: "percentage" },
    { key: "averageResponseQualityScore", label: "Average Response Quality Score", sourceStateKey: "averageResponseQualityScore", format: "number" },
    { key: "criticalRequestVolumePerMinute", label: "Critical Request Volume / min", sourceStateKey: "criticalRequestVolumePerMinute", format: "number" },
    { key: "cacheReuseHitRatePercent", label: "Cache Reuse Hit Rate", sourceStateKey: "cacheReuseHitRatePercent", format: "percentage" },
    { key: "classifierRemediationProgressPercent", label: "Classifier Remediation Progress", sourceStateKey: "classifierRemediationProgressPercent", format: "percentage" },
    { key: "cumulativeSilentCriticalDowngradeCount", label: "Cumulative Silent Critical Downgrades (historical)", sourceStateKey: "cumulativeSilentCriticalDowngradeCount", format: "number" },
    { key: "costStatus", label: "Cost Status", sourceStateKey: "costStatus", format: "status" },
    { key: "qualityProtectionStatus", label: "Quality Protection Status", sourceStateKey: "qualityProtectionStatus", format: "status" },
  ],
  controls: [
    {
      key: ROUTING_POLICY_KEY,
      label: "Routing Policy",
      componentId: "routing-layer",
      valueLabels: {
        "classifier-only": "Classifier-Only (Default)",
        "quality-tiering": "Quality-Tiering by Declared Criticality",
        "blanket-small-model": "Blanket: Always Small Model",
        "blanket-large-model": "Blanket: Always Large Model",
      },
    },
    {
      key: CLASSIFIER_REMEDIATION_KEY,
      label: "Classifier Remediation",
      componentId: "routing-layer",
      valueLabels: { false: "Off", true: "Dispatch Classifier Fix" },
    },
    {
      key: CRITICAL_SEGMENT_POLICY_KEY,
      label: "Critical Segment Policy",
      componentId: "routing-layer",
      valueLabels: { unprotected: "Unprotected", "always-large-model": "Pin Critical Traffic to Large Model" },
    },
    {
      key: SMALL_MODEL_QUALITY_FLOOR_KEY,
      label: "Small Model Quality Floor",
      componentId: "small-model",
      valueLabels: { standard: "Standard", enhanced: "Enhanced" },
    },
    {
      key: NON_CRITICAL_CACHE_REUSE_KEY,
      label: "Non-Critical Cache Reuse",
      componentId: "routing-layer",
      valueLabels: { off: "Off", on: "On" },
    },
  ],
  components: [
    { id: "requests", label: "Requests" },
    { id: "routing-layer", label: "Routing Layer" },
    { id: "large-model", label: "Large Model" },
    { id: "small-model", label: "Small Model" },
    { id: "feature-store", label: "Feature Store" },
  ],
};
