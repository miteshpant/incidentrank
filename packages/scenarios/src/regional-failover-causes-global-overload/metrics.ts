import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Percentage of the GLOBAL traffic volume each region is currently
  // serving. Baseline: Region A carries the largest share (50%), Region B
  // and Region C each carry 25% — a realistic asymmetric footprint, not
  // an even three-way split, which is exactly why Region A's loss cannot
  // be absorbed by an even split across the other two without real
  // capacity math.
  regionATrafficPct: 50,
  regionBTrafficPct: 25,
  regionCTrafficPct: 25,

  // Percentage of Region A's ORIGINAL traffic share that is currently
  // being auto-failed-over into Region B + Region C combined (bounded by
  // FAILOVER_CAP_KEY). Zero while Region A is healthy.
  regionAFailoverPct: 0,
  // Percentage of Region A's ORIGINAL traffic share that is being
  // intentionally shed (dropped) rather than served anywhere -- this is
  // ONLY ever the bounded optional/low-priority share (at most 20 points)
  // when LOW_PRIORITY_TRAFFIC_KEY is "shed". It is a DIFFERENT, separately
  // tracked quantity from critical traffic that gets dropped because
  // FAILOVER_CAP_KEY was set too low to cover it -- see
  // regionACriticalTrafficDroppedPct below.
  shedTrafficPct: 0,
  // Percentage of Region A's ORIGINAL traffic share that is
  // business-critical AND currently being dropped because neither Region
  // A nor the failover cap can currently carry it. This must stay at 0
  // for the business invariant "critical customer operations must remain
  // available" to hold; any nonzero value here is a direct, authored
  // violation of that invariant, distinct from ordinary unavailability.
  regionACriticalTrafficDroppedPct: 0,

  // API-tier utilization, 0-100 normally, able to exceed 100 to represent
  // genuine overload (requests queuing/timing out beyond rated capacity).
  regionAApiUtilization: 70,
  regionBApiUtilization: 70,
  regionCApiUtilization: 70,

  // Database-tier utilization, same scale and meaning as API utilization
  // above but for the DB tier specifically -- the tier that saturates
  // first and hardest when DB_CONCURRENCY_KEY is left uncapped during a
  // traffic surge.
  regionADbUtilization: 65,
  regionBDbUtilization: 65,
  regionCDbUtilization: 65,

  // Cache hit rate, 0-100, per region. Drops sharply when a region
  // absorbs failover traffic with cold cache keys and CACHE_PROTECTION_KEY
  // is "off" -- a thundering herd straight through to the database.
  regionACacheHitRate: 92,
  regionBCacheHitRate: 92,
  regionCCacheHitRate: 92,

  // Customer-facing request success rate, 0-100, per region.
  regionACustomerSuccessPct: 100,
  regionBCustomerSuccessPct: 100,
  regionCCustomerSuccessPct: 100,

  // Weighted global customer success rate across all three regions'
  // actual served traffic (excludes traffic that was never attempted
  // because it was shed or dropped -- those are tracked separately above
  // and via globalSheddingImpact below, exactly so a high globalSuccessRate
  // cannot quietly hide a large shed/dropped volume).
  globalSuccessRate: 100,

  // Combined queue depth across Region B + Region C's API tiers --
  // requests accepted but not yet served, a direct, observable sign of
  // sustained overload. Zero when both regions are within capacity.
  queueDepth: 0,

  // Severity field (packages/simulator/src/types.ts SeverityFieldConfig):
  // tracks whether Region B and/or Region C are themselves at risk of
  // becoming a SECOND failed region as a direct consequence of
  // absorbing Region A's failover traffic. This is the authored
  // pressure-transfer signal this scenario exists to make observable --
  // "critical" means a mitigation aimed at Region A's incident has
  // pushed a previously healthy region to the edge of its own failure.
  secondRegionRiskStatus: "normal",

  // Generic string-state field (read by scoring's dataIntegrity-adjacent
  // measure) recording the dominant mechanism currently keeping the
  // system safe, if any:
  //   "uncontained"              -- no cap/shed engaged; the default trap
  //                                 and every unmanaged fallback state.
  //   "capacity-managed-partial" -- cap+shed correct, but at most one of
  //                                 cache-protection/DB-concurrency
  //                                 engaged; real but non-critical stress.
  //   "capacity-managed-full"    -- cap+shed correct AND both protection
  //                                 controls engaged; Region B/C never at
  //                                 risk, even with Region A still
  //                                 offline.
  //   "restored-safely"          -- Region A's capacity fully, gradually
  //                                 restored and Region B/C have actually
  //                                 drained -- the complete end-state.
  //   "retriggered"              -- a prior safe state was broken by
  //                                 restoring traffic faster than Region
  //                                 B/C's recovery lag allowed.
  containmentMechanism: "uncontained",
};
