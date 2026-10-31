import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  producerPublishRatePerSecond: 40,
  queueDepth: 500,
  activeConsumerCount: 12,
  workerCrashLoopRestartCount: 0,
  jobAgeP95Seconds: 8,
  notificationDeliveryDelaySeconds: 5,
  producerErrorRate: 0.1,
  monitoringDashboardRefreshLagSeconds: 2,
  diagnosisPath: "not-attempted",
};
