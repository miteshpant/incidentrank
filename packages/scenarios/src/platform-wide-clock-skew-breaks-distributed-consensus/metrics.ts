import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  fleetClockSkewMs: 12,
  lockServiceSplitBrainCount: 0,
  ledgerOutOfOrderWriteRatePercent: 0.1,
  rateLimiterFalseThrottleRatePercent: 0.2,
  ntpSyncOffsetMs: 8,
  apiRequestVolumePerSecond: 4_200,
  diagnosisPath: "not-attempted",
};
