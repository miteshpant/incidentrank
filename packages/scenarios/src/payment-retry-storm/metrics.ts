import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  checkoutSuccessRate: 99.9,
  checkoutP99LatencyMs: 420,
  paymentProviderLatencyMs: 180,
  paymentTraffic: "normal",
  dbPressure: "normal",
  kafkaLagMessages: 0,
};
