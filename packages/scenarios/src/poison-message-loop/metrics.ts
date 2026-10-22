import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  queueDepth: 20,
  retryLoopCount: 0,
  healthyMessageBacklog: 0,
  consumerCpuUtilization: 15,
  queueStatus: "normal",
};
