import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Severity field (normal | warning | critical) driving the engine's
  // own derived status (healthy/degraded/critical) — mirrors Missing
  // Database Index's dbStatus and Split-Brain's coordinatorStatus.
  limiterHealth: "normal",
  rejectionRate: 1,
  legitimateTenantSuccessRate: 99,
  bursterShareOfCapacity: 8,
  backendUtilization: 22,
  limiterBucketUtilization: 15,
  customerSuccessRate: 99,
  // Generic string-state field (same pattern as Missing Database Index's
  // orderHistoryQueryHealth / Split-Brain's writeAuthorityState):
  // distinguishes WHY customer-facing metrics look the way they do.
  // "protected" means the limiter is actively enforcing fairness.
  // "unprotected" means enforcement has been removed (emergency bypass)
  // — even if every customer-facing number above looks healthy, this
  // field is the real, authored signal that the fairness guarantee the
  // limiter exists to provide is gone. Read only by successCondition /
  // acceptableCondition / scoring's dataIntegrity measure, never by any
  // scenario-specific scorer code.
  rateLimitStatus: "protected",
  // A second generic string-state field distinguishing the two
  // protected-and-healthy outcomes from each other: "capped" means the
  // dominant tenant's own ceiling has been directly bounded (the
  // optimal, durable fix); "uncapped" means legitimate traffic is
  // genuinely protected but the dominant tenant's own consumption
  // ceiling was never addressed (the real, bounded acceptable
  // tradeoff). "not-applicable" covers every unresolved/unprotected
  // state, where this distinction doesn't yet apply.
  burstFairnessState: "not-applicable",
};
