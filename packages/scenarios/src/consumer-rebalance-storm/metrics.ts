import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  rebalanceCount: 0,
  groupStableTimeRatio: 99,
  effectiveThroughput: 4_000,
  consumerLagMessages: 100,
  groupStatus: "normal",
};
