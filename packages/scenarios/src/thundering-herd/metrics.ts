import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  requestsPerSecond: 80,
  gatewayErrorRate: 0.1,
  authServiceLatencyMs: 30,
  rejectedRequestCount: 0,
  gatewayStatus: "normal",
};
