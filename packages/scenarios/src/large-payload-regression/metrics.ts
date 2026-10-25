import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  responsePayloadSizeKb: 18,
  p99LatencyMs: 90,
  apiMemoryUtilization: 22,
  networkUtilizationMbps: 40,
  errorRatePercent: 0,
  throughputRps: 800,
  apiStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent) distinguishing WHY
  // the system looks healthy — "shape-fixed" means the response shape
  // itself was actually corrected (projection/pagination put the payload
  // back to a sane per-request size); "feature-limited" means a hard
  // size cap is silently truncating responses instead; "unresolved"
  // means neither has happened. Read only by success/acceptable
  // conditions and scoring's dataIntegrity measure, never by any
  // scenario-specific scorer code.
  payloadShapeHealth: "unresolved",
};
