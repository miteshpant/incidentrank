import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  errorRate: 0.1,
  latencyP99Ms: 120,
  memoryUsageMb: 400,
  affectedRequestCount: 0,
  deployStatus: "normal",
};
