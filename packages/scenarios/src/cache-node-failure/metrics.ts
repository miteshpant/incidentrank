import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  cacheHitRatePercent: 96,
  dbReadsPerSecond: 80,
  cacheNodeLoadPercent: 35,
  apiLatencyMs: 55,
  evictionRatePerMinute: 5,
  cacheStatus: "normal",
};
