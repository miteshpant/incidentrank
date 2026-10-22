import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  requestRejectionRate: 0.1,
  affectedUserCount: 0,
  apiServiceCpuUtilization: 20,
  timeSinceConfigPushMs: 0,
  configStatus: "normal",
};
