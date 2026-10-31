import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  appServiceErrorRatePercent: 0.2,
  appServiceP99LatencyMs: 90,
  azAVolumeIoErrorRatePercent: 0.5,
  migrationCopyThroughputMBps: 180,
  migrationRetryRatePerMinute: 2,
  azCConnectionUtilizationPercent: 22,
  azCP99LatencyMs: 40,
  migrationProgressPercent: 35,
  controllerCpuPercent: 15,
  diagnosisPath: "not-attempted",
};
