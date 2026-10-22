import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  blockedTransactions: 0,
  queryLatencyP99Ms: 60,
  lockWaitTimeMs: 20,
  timedOutTransactions: 0,
  lockStatus: "normal",
};
