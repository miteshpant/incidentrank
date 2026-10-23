import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  hotKeyTrafficRps: 400,
  hotShardUtilizationPct: 20,
  hotShardLatencyMs: 8,
  otherShardsUtilizationPct: 22,
  otherShardsLatencyMs: 9,
  cacheHitRatePct: 97,
  originRequestRatePerSec: 60,
  apiLatencyMs: 25,
  hotShardStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Missing Database
  // Index's orderHistoryQueryHealth) distinguishing WHY the system looks
  // healthy, if it does — "targeted" means a fix that specifically
  // addresses the hot key was applied (replication, coalescing, or local
  // API caching); "origin-shielded" means only the origin was protected
  // while the hot shard itself stays saturated; "unresolved" means
  // neither has happened. Read only by successCondition/
  // acceptableCondition/scoring, never by scenario-specific scorer code.
  hotKeyMitigationMode: "unresolved",
};
