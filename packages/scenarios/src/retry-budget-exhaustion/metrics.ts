import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  recommendationLatencyMs: 60,
  recommendationErrorRate: 0.2,
  pricingCallVolumeMultiplier: 1,
  pricingErrorRatePercent: 2,
  pricingP95LatencyMs: 90,
  retryAmplificationRatio: 1,
  deployPipelineQueueDepth: 3,
  diagnosisPath: "not-attempted",
};
