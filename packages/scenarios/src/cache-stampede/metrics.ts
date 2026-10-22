import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  originRequestRate: 50,
  cacheHitRate: 98,
  originLatencyMs: 40,
  queuedRequests: 0,
  cacheStatus: "normal",
};
