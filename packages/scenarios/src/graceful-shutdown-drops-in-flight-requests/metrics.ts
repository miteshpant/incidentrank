import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  droppedRequestsPerDeploy: 0,
  checkoutErrorRate: 0.1,
  deployDurationSeconds: 90,
  orderEventsLagMessages: 5,
  podTerminationGraceExceededCount: 0,
  cpuThrottlePercent: 12,
  diagnosisPath: "not-attempted",
  investigationQuality: "not-attempted",
};
