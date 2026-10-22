import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  authServiceLatencyMs: 40,
  authFailureRate: 0.1,
  tokenValidationThroughput: 4_000,
  activeSessionCount: 500,
  authServiceStatus: "normal",
};
