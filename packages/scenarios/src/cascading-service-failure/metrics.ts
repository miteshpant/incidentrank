import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  rootServiceErrorRate: 0.1,
  cascadeDepth: 0,
  aggregateQueueDepth: 20,
  checkoutSuccessRate: 99.9,
  chainStatus: "normal",
};
