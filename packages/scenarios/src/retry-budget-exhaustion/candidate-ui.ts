import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CIRCUIT_BREAKER_ENABLED_KEY,
  INSPECT_RETRY_METRICS_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  PRICING_SERVICE_REPLICA_COUNT_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 *
 * `retryAmplificationRatio` is the root cause: it is a direct
 * measurement of how many times Recommendation Service's retry policy
 * multiplies each real customer call into Pricing Service. `pricingP95
 * LatencyMs` and `pricingErrorRatePercent` are downstream symptoms of
 * that amplified load, not causes in their own right.
 * `deployPipelineQueueDepth` is the noise signal — it climbs during the
 * incident (shared CI infrastructure gets busier under the general
 * on-call response) but is causally unrelated to the retry/circuit-
 * breaker fix, mirroring monitoringAgentFlapCount in the reference
 * incident.
 */
export const retryBudgetExhaustionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "recommendationLatencyMs",
      label: "Recommendation Service Latency",
      sourceStateKey: "recommendationLatencyMs",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "recommendationErrorRate",
      label: "Recommendation Service Error Rate",
      sourceStateKey: "recommendationErrorRate",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "pricingCallVolumeMultiplier",
      label: "Pricing Call Volume Multiplier",
      sourceStateKey: "pricingCallVolumeMultiplier",
      format: "number",
      roleInIncident: "contributing_factor",
    },
    {
      key: "pricingErrorRatePercent",
      label: "Pricing Service Error Rate",
      sourceStateKey: "pricingErrorRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "pricingP95LatencyMs",
      label: "Pricing Service p95 Latency",
      sourceStateKey: "pricingP95LatencyMs",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "retryAmplificationRatio",
      label: "Retry Amplification Ratio",
      sourceStateKey: "retryAmplificationRatio",
      format: "number",
      roleInIncident: "root_cause",
    },
    {
      key: "deployPipelineQueueDepth",
      label: "Deploy Pipeline Queue Depth",
      sourceStateKey: "deployPipelineQueueDepth",
      format: "number",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_RETRY_METRICS_KEY,
      label: "Inspect Retry Metrics",
      componentId: "recommendation-service",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: MAX_RETRY_ATTEMPTS_KEY,
      label: "Max Retry Attempts",
      componentId: "recommendation-service",
      kind: "remediation",
      valueLabels: { "0": "0", "1": "1", "3": "3", "5": "5" },
    },
    {
      key: CIRCUIT_BREAKER_ENABLED_KEY,
      label: "Circuit Breaker",
      componentId: "recommendation-service",
      kind: "remediation",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: PRICING_SERVICE_REPLICA_COUNT_KEY,
      label: "Pricing Service Replica Count",
      componentId: "pricing-service",
      kind: "remediation",
      valueLabels: { "4": "4", "8": "8", "16": "16", "32": "32" },
    },
  ],
  components: [
    { id: "recommendation-service", label: "Recommendation Service" },
    { id: "pricing-service", label: "Pricing Service" },
  ],
};
