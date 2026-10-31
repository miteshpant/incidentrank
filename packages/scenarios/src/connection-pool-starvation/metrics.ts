import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  trafficRequestsPerSecond: 420,
  requestLatencyMs: 90,
  requestErrorRate: 0.1,
  poolUtilizationPercent: 22,
  poolWaitQueueDepth: 0,
  dbCpuPercent: 24,
  apiPodRestartCount: 0,
  deployAuditLogScrollCount: 0,
  diagnosisPath: "not-attempted",
};
