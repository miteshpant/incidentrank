import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  jobRunDurationMinutes: 18,
  concurrentRunCount: 1,
  dailyMetricsDuplicateRowPercent: 0,
  dailyMetricsRowCount: 48_000,
  sourceTableScanLatencyMs: 900,
  schedulerMissedFireCount: 0,
  diagnosisPath: "not-attempted",
};
