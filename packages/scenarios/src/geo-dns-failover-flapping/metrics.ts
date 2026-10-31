import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  regionEastP99LatencyMs: 180,
  regionWestP99LatencyMs: 190,
  healthCheckFailureStreakCount: 0,
  dnsFailoverFlapCount: 0,
  clientConnectionResetRatePercent: 0.2,
  clientErrorRatePercent: 0.3,
  edgeCdnCacheHitRatePercent: 92,
  diagnosisPath: "not-attempted",
};
