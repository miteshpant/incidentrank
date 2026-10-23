import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  interRegionRttMs: 40,
  replicationLagMs: 50,
  syncWriteLatencyMs: 70,
  usCustomerLatencyMs: 90,
  euCustomerLatencyMs: 95,
  crossRegionRequestVolume: 1_200,
  backboneStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Missing Database
  // Index's orderHistoryQueryHealth, Distributed Lock Failure's
  // lockSafetyMechanism) recording WHETHER the one operation the
  // business requires to stay strongly consistent — payment
  // authorization — is actually still strongly consistent, not merely
  // whether the system currently looks healthy. "strong" is the only
  // safe value. "relaxed-unsafe" means payment authorization itself was
  // switched to eventual consistency while the cross-region dependency
  // for that path was still live — the one genuinely unsafe move this
  // scenario models. Read only by successCondition and scoring's
  // dataIntegrity measure, never by any scenario-specific scorer code.
  paymentAuthConsistency: "strong",
};
