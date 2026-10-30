import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  checkoutLatencyMs: 80,
  checkoutErrorRate: 0.1,
  paymentRetryRatePercent: 2,
  paymentTimeoutRatePercent: 3,
  inventoryP95LatencyMs: 120,
  redisCpuPercent: 18,
  redisMemoryPercent: 35,
  redisConnectionUtilizationPercent: 20,
  monitoringAgentFlapCount: 0,
  diagnosisPath: "not-attempted",
};
