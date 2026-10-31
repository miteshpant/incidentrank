import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  writeLatencyP99Ms: 12,
  writeErrorRate: 0.05,
  writeAmplificationFactor: 3.1,
  compactionBacklogSstables: 40,
  diskIopsUtilizationPercent: 38,
  diskQueueDepth: 4,
  cpuUtilizationPercent: 22,
  configChangeAgeDays: 21,
  monitoringDashboardRefreshLagSeconds: 1,
  diagnosisPath: "not-attempted",
};
