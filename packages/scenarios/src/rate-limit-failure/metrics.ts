import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  rateLimitViolationRate: 0.2,
  effectiveThroughput: 480,
  retryQueueDepth: 5,
  throttleWindowRemainingMs: 0,
  rateLimitStatus: "normal",
};
