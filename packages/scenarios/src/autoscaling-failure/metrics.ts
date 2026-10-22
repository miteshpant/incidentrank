import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  currentInstanceCount: 4,
  requestQueueDepth: 0,
  cpuUtilizationPercent: 35,
  errorRate: 0.1,
  capacityStatus: "normal",
};
