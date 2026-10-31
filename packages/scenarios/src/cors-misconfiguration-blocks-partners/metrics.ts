import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  internalWebAppErrorRatePercent: 0.2,
  partnerCorsPreflightRejectionRatePercent: 1,
  partnerApiErrorRatePercent: 1,
  partnerIntegrationRequestVolumePercent: 100,
  cdnCacheHitRatePercent: 92,
  corsPolicyStatus: "normal",
  diagnosisPath: "not-attempted",
};
