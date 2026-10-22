import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  consumerLagMessages: 200,
  processingLatencyMs: 150,
  errorRate: 0.1,
  deadLetterCount: 0,
  consumerStatus: "normal",
};
