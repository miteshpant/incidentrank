import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  connectionUsage: 40,
  requestLatencyMs: 80,
  errorRate: 0.1,
  queuedConnections: 0,
  dbStatus: "normal",
};
