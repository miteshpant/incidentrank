import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  cacheMissRatePct: 2,
  concurrentRefreshes: 3,
  originQps: 80,
  originLatencyMs: 35,
  apiLatencyMs: 40,
  refreshFailureRatePct: 0,
  cacheHitRatioPct: 98,
  originStatus: "normal",
  // Generic string-state field distinguishing WHY origin load looks the
  // way it does — "unresolved" (herd still forming/active),
  // "coalesced" (fleet-wide single-flight collapsed the herd into one
  // real refresh per key), "jittered" (expiry was desynchronized at the
  // source, so no herd forms at all), "stale-served" (callers never
  // waited on a synchronous refresh), or "masked" (origin shielded by
  // raw concurrency limiting without removing per-instance racing).
  // Read only by successCondition/scoring's finalStringEquals measure,
  // never by scenario-specific scorer code.
  revalidationMode: "unresolved",
};
