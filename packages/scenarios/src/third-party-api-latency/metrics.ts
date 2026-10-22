import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  checkoutServiceThreadPoolUtilization: 20,
  thirdPartyResponseTimeMs: 180,
  checkoutAbandonmentRate: 2,
  cacheFallbackHitRate: 0,
  checkoutStatus: "normal",
};
