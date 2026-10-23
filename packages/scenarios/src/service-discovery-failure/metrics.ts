import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  connectionFailuresPerMinute: 5,
  healthyEndpointCount: 8,
  discoveryRefreshAgeSeconds: 10,
  serviceCLatencyMs: 80,
  retryVolumePerMinute: 20,
  discoveryStatus: "normal",
};
