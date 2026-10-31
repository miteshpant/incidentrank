import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  checkoutErrorRate: 0.2,
  checkoutLatencyMs: 90,
  priceMismatchRatePercent: 0,
  legacyPricingEngineTrafficSharePercent: 0,
  pricingCacheStaleEntryCount: 0,
  supportTicketBacklogCount: 12,
  diagnosisPath: "not-attempted",
};
