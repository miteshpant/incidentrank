import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  hotPartitionLagMessages: 150,
  aggregateConsumerUtilization: 45,
  hotPartitionLatencyMs: 120,
  idleConsumerCount: 0,
  partitionStatus: "normal",
};
