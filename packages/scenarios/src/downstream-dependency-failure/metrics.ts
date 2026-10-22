import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  callingServiceThreadPoolUtilization: 20,
  requestLatencyP99Ms: 80,
  failedRequestRate: 0.1,
  queuedRequests: 0,
  callingServiceStatus: "normal",
};
