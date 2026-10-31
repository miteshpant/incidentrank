import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  requestLatencyMs: 70,
  requestErrorRatePercent: 0.2,
  sessionAffinityMismatchRatePercent: 1,
  sessionStateInconsistencyRatePercent: 0.5,
  unexpectedLogoutRatePercent: 0.3,
  cacheNodeCpuPercent: 22,
  cacheNodeMemoryPercent: 30,
  authServiceErrorRatePercent: 0.2,
  diagnosisPath: "not-attempted",
};
