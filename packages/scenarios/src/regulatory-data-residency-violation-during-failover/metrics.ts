import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  euRequestAvailabilityPercent: 99.9,
  euRequestLatencyMs: 90,
  euPersonalDataRecordsProcessedInUsCount: 0,
  dataResidencyViolationMinutes: 0,
  usRegionCpuPercent: 22,
  euRegionCpuPercent: 24,
  supportEscalationCount: 0,
  diagnosisPath: "not-attempted",
  remediationStrategy: "not-attempted",
  investigationQuality: "not-attempted",
};
