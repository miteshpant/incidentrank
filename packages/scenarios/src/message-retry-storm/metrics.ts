import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  queueDepth: 40,
  retryRatePerMinute: 5,
  downstreamRequestVolumePerMinute: 300,
  workerSuccessRate: 99.8,
  dependencyErrorRate: 0.2,
  processingLatencyMs: 220,
  queueHealth: "normal",
};
