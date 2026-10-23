import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  evictionRatePerSec: 20,
  hitRatioPct: 94,
  memoryUtilizationPct: 55,
  dbReadsPerSec: 180,
  cacheLatencyMs: 4,
  apiLatencyMs: 60,
  cacheStatus: "normal",
  // Generic string-state field distinguishing WHY the cache looks
  // healthy/stable — "policyFixed" means the caching/admission policy was
  // actually changed to match the new object shape/cardinality;
  // "memoryScaled" means only the memory multiplier was raised (real but
  // partial relief, the same churn at a larger scale); "unresolved" means
  // neither has happened. Read only by successCondition/scoring's
  // dataIntegrity-adjacent measure, never by any scenario-specific scorer
  // code.
  cacheRecoveryMode: "unresolved",
};
