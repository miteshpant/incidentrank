import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  queryLatencyP99Ms: 40,
  cpuUtilization: 15,
  queuedQueries: 0,
  rowsScanned: 500,
  queryStatus: "normal",
};
