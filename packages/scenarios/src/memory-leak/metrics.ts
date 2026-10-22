import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  memoryUsageMb: 400,
  gcPauseMs: 15,
  errorRate: 0.1,
  processRestartCount: 0,
  serviceStatus: "normal",
};
