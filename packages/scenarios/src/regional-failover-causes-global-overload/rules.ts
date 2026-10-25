import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CACHE_PROTECTION_KEY,
  DB_CONCURRENCY_KEY,
  FAILOVER_CAP_KEY,
  LOW_PRIORITY_TRAFFIC_KEY,
  REGION_A_RESTORATION_KEY,
  TRAFFIC_RESTORE_PACE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "global-router": "healthy",
  "region-a-api": "healthy",
  "region-a-cache": "healthy",
  "region-a-db": "healthy",
  "region-b-api": "healthy",
  "region-b-cache": "healthy",
  "region-b-db": "healthy",
  "region-c-api": "healthy",
  "region-c-cache": "healthy",
  "region-c-db": "healthy",
};

const regionAFailedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "region-a-api": "critical",
  "region-a-cache": "critical",
  "region-a-db": "critical",
};

const regionAFailedBcCriticalHealth: Record<string, ComponentHealth> = {
  ...regionAFailedHealth,
  "region-b-api": "critical",
  "region-b-db": "critical",
  "region-c-api": "critical",
  "region-c-db": "critical",
};

const regionAFailedBcDegradedHealth: Record<string, ComponentHealth> = {
  ...regionAFailedHealth,
  "region-b-api": "degraded",
  "region-b-db": "degraded",
  "region-c-api": "degraded",
  "region-c-db": "degraded",
};

const regionAPartialHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "region-a-api": "degraded",
  "region-a-cache": "degraded",
  "region-a-db": "degraded",
};

// Region A partially restored (degraded, not critical) while Region B/C
// are still mid-drain (also degraded, not critical) -- the real
// in-between state during a gradual, not-yet-complete restoration.
const regionAPartialBcDegradedHealth: Record<string, ComponentHealth> = {
  ...regionAPartialHealth,
  "region-b-api": "degraded",
  "region-b-db": "degraded",
  "region-c-api": "degraded",
  "region-c-db": "degraded",
};

/**
 * Authored rule table for Regional Failover Causes Global Overload,
 * ordered most-specific first.
 *
 * Business invariants (stated in the candidate briefing, see
 * regional-failover-causes-global-overload.ts): critical customer
 * operations must remain available; optional traffic may be shed;
 * healthy regions must not be driven into failure; partial regional loss
 * is preferable to global collapse.
 *
 * Of Region A's original 50-point global traffic share, 80% (40 of the
 * 50 points, expressed below as "80% of Region A's own traffic") is
 * business-critical and must be served somewhere; the remaining 20% is
 * optional/low-priority and may legitimately be shed
 * (LOW_PRIORITY_TRAFFIC_KEY). FAILOVER_CAP_KEY bounds how much of Region
 * A's traffic the router may redirect into Region B + Region C combined.
 * Two independently bad outcomes are modeled, not just one:
 *
 *   - FAILOVER_CAP_KEY left high (uncapped) with no shedding/protection:
 *     Region B/C are driven toward their OWN capacity limits --
 *     regionACriticalTrafficDroppedPct stays 0, but
 *     secondRegionRiskStatus goes critical and regionB/CCustomerSuccessPct
 *     collapse. This is the named harmful/tempting path ("send all A
 *     traffic to B/C").
 *   - FAILOVER_CAP_KEY set too low (below 80) while optional traffic is
 *     NOT shed and Region A is not restored: real critical traffic has
 *     nowhere to go. regionACriticalTrafficDroppedPct goes nonzero -- a
 *     direct, distinct violation of "critical customer operations must
 *     remain available," even though Region B/C look perfectly healthy.
 *
 * The safe combination is FAILOVER_CAP_KEY=80 (exactly covers critical
 * traffic, no more) + LOW_PRIORITY_TRAFFIC_KEY=shed (sheds exactly the
 * optional remainder instead of either dropping it blindly or forcing it
 * onto B/C) + CACHE_PROTECTION_KEY=on + DB_CONCURRENCY_KEY=capped
 * (protects B/C's own tiers from the failover traffic they do legitimately
 * absorb).
 *
 * Recovery sequencing: once Region A reports recovered capacity
 * (regionACapacityReturned trigger), restoring traffic back to Region A
 * requires TWO independent candidate decisions, not one. First,
 * REGION_A_RESTORATION_KEY must actually be moved off its "offline"
 * default -- Region A reporting recovered capacity does not, by itself,
 * restore any traffic; the candidate must declare "partial" (bring back
 * half of Region A's original 50-point share) or "full" (bring back all
 * of it). Second, whatever share is being restored is only safe to move
 * if Region B/C have actually finished draining the backlog they
 * accumulated (regionBcDrainWindowElapsed trigger) AND the restore is
 * paced gradually (TRAFFIC_RESTORE_PACE_KEY="gradual"). Setting the pace
 * to "instant" re-floods the router's traffic graph and reopens exactly
 * the same contention on Region B/C's still-warming caches and
 * still-draining queues -- a real, authored retrigger, not a cosmetic
 * one -- and this holds for a "partial" restoration too: a smaller
 * share shifted all at once is still a real, if smaller, flood.
 */
export const regionalFailoverRules: Rule[] = [
  // ── Post-recovery states (regionACapacityReturned=true). Checked
  // before the active-incident rules below so the recovery-era rules win
  // once Region A has reported recovered capacity.

  // ── Region A's own infrastructure has recovered capacity
  // (regionACapacityReturned=true) but the candidate has not actually
  // declared a restoration mode yet (REGION_A_RESTORATION_KEY still at its
  // "offline" default). Region A reporting health and the candidate
  // actually acting on it are two different things -- without the
  // candidate explicitly moving this control off "offline", nothing is
  // restored regardless of how the restore pace is set. Falls through to
  // the active-incident rules below (same failover-managed state the
  // candidate already reached), since Region A is still being treated as
  // fully offline for traffic-share purposes.

  // ── SAFE but only PARTIALLY restored: Region A has recovered enough
  // capacity to safely take back SOME of its original share
  // (REGION_A_RESTORATION_KEY="partial"), and the restore is paced
  // gradually. Only half of Region A's original 50-point share (25 of
  // 50) is handed back; the rest remains on the already-safely-managed
  // failover path. A genuinely smaller, safer traffic shift than "full"
  // restoration -- Region B/C give back proportionally less headroom, so
  // they stay comfortably within capacity even before the drain window
  // has fully elapsed.
  {
    id: "restore-partial-gradual",
    when: {
      triggerEquals: { regionACapacityReturned: true },
      controlEquals: {
        [REGION_A_RESTORATION_KEY]: "partial",
        [TRAFFIC_RESTORE_PACE_KEY]: "gradual",
      },
    },
    incidentState: "restore-partial-gradual",
    values: {
      regionATrafficPct: 25,
      regionBTrafficPct: 37.5,
      regionCTrafficPct: 37.5,
      regionAFailoverPct: 40,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 72,
      regionBApiUtilization: 80,
      regionCApiUtilization: 80,
      regionADbUtilization: 68,
      regionBDbUtilization: 78,
      regionCDbUtilization: 78,
      regionACacheHitRate: 85,
      regionBCacheHitRate: 88,
      regionCCacheHitRate: 88,
      regionACustomerSuccessPct: 97,
      regionBCustomerSuccessPct: 96,
      regionCCustomerSuccessPct: 96,
      globalSuccessRate: 96,
      queueDepth: 300,
      secondRegionRiskStatus: "normal",
      containmentMechanism: "capacity-managed-full",
    },
    componentHealth: regionAPartialHealth,
  },

  // ── UNSAFE retrigger, partial restoration variant: Region A has only
  // partially recovered capacity, but the candidate restores at "instant"
  // pace anyway. Even though the traffic share being shifted back (25 of
  // 50 points) is smaller than the full-restoration retrigger case below,
  // shifting it all at once -- without regard for whether Region B/C have
  // actually drained -- is still enough to re-flood their still-warming
  // caches and still-draining queues. Partial restoration does not make
  // "instant" pace safe; it only changes how much comes back at once.
  {
    id: "restore-partial-instant-retrigger",
    when: {
      triggerEquals: { regionACapacityReturned: true },
      controlEquals: {
        [REGION_A_RESTORATION_KEY]: "partial",
        [TRAFFIC_RESTORE_PACE_KEY]: "instant",
      },
    },
    incidentState: "restore-partial-instant-retrigger",
    values: {
      regionATrafficPct: 25,
      regionBTrafficPct: 37.5,
      regionCTrafficPct: 37.5,
      regionAFailoverPct: 40,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 72,
      regionBApiUtilization: 118,
      regionCApiUtilization: 118,
      regionADbUtilization: 68,
      regionBDbUtilization: 125,
      regionCDbUtilization: 125,
      regionACacheHitRate: 65,
      regionBCacheHitRate: 50,
      regionCCacheHitRate: 50,
      regionACustomerSuccessPct: 96,
      regionBCustomerSuccessPct: 65,
      regionCCustomerSuccessPct: 65,
      globalSuccessRate: 75,
      queueDepth: 4800,
      secondRegionRiskStatus: "critical",
      containmentMechanism: "retriggered",
    },
    componentHealth: {
      ...regionAPartialHealth,
      "region-b-api": "critical",
      "region-b-db": "critical",
      "region-c-api": "critical",
      "region-c-db": "critical",
    },
  },

  // ── UNSAFE retrigger: Region A has been declared FULLY restored
  // (REGION_A_RESTORATION_KEY="full"), but the candidate restores traffic
  // at "instant" pace. This ignores whether Region B/C have actually
  // drained, re-flooding them with the traffic shift all at once --
  // regardless of how safely the failover window itself was managed.
  {
    id: "restore-instant-retrigger",
    when: {
      triggerEquals: { regionACapacityReturned: true },
      controlEquals: {
        [REGION_A_RESTORATION_KEY]: "full",
        [TRAFFIC_RESTORE_PACE_KEY]: "instant",
      },
    },
    incidentState: "restore-instant-retrigger",
    values: {
      regionATrafficPct: 50,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 0,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 72,
      regionBApiUtilization: 128,
      regionCApiUtilization: 128,
      regionADbUtilization: 68,
      regionBDbUtilization: 140,
      regionCDbUtilization: 140,
      regionACacheHitRate: 60,
      regionBCacheHitRate: 45,
      regionCCacheHitRate: 45,
      regionACustomerSuccessPct: 95,
      regionBCustomerSuccessPct: 58,
      regionCCustomerSuccessPct: 58,
      globalSuccessRate: 68,
      queueDepth: 6200,
      secondRegionRiskStatus: "critical",
      containmentMechanism: "retriggered",
    },
    componentHealth: regionAFailedBcCriticalHealth,
  },

  // ── OPTIMAL: Region A has been declared FULLY restored, the drain
  // window has actually elapsed, and the restore was paced gradually.
  // Region B/C have genuinely drained and re-warmed; traffic is safely
  // rebalanced back to the full pre-incident split.
  {
    id: "restore-gradual-after-drain-safe",
    when: {
      triggerEquals: {
        regionACapacityReturned: true,
        regionBcDrainWindowElapsed: true,
      },
      controlEquals: {
        [REGION_A_RESTORATION_KEY]: "full",
        [TRAFFIC_RESTORE_PACE_KEY]: "gradual",
      },
    },
    incidentState: "restore-gradual-after-drain-safe",
    values: {
      regionATrafficPct: 50,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 0,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 72,
      regionBApiUtilization: 71,
      regionCApiUtilization: 71,
      regionADbUtilization: 66,
      regionBDbUtilization: 66,
      regionCDbUtilization: 66,
      regionACacheHitRate: 90,
      regionBCacheHitRate: 92,
      regionCCacheHitRate: 92,
      regionACustomerSuccessPct: 99,
      regionBCustomerSuccessPct: 100,
      regionCCustomerSuccessPct: 100,
      globalSuccessRate: 100,
      queueDepth: 0,
      secondRegionRiskStatus: "normal",
      containmentMechanism: "restored-safely",
    },
    componentHealth: healthyHealth,
  },

  // ── Region A declared FULLY restored with gradual pace selected, but
  // the drain window has not elapsed yet. Genuinely better than "instant"
  // (no re-flood), but B/C are still mid-drain -- not yet the fully safe
  // state.
  {
    id: "restore-gradual-before-drain-pending",
    when: {
      triggerEquals: { regionACapacityReturned: true },
      controlEquals: {
        [REGION_A_RESTORATION_KEY]: "full",
        [TRAFFIC_RESTORE_PACE_KEY]: "gradual",
      },
    },
    incidentState: "restore-gradual-before-drain-pending",
    values: {
      regionATrafficPct: 50,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 0,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 72,
      regionBApiUtilization: 85,
      regionCApiUtilization: 85,
      regionADbUtilization: 68,
      regionBDbUtilization: 88,
      regionCDbUtilization: 88,
      regionACacheHitRate: 85,
      regionBCacheHitRate: 78,
      regionCCacheHitRate: 78,
      regionACustomerSuccessPct: 97,
      regionBCustomerSuccessPct: 90,
      regionCCustomerSuccessPct: 90,
      globalSuccessRate: 92,
      queueDepth: 900,
      secondRegionRiskStatus: "warning",
      containmentMechanism: "capacity-managed-full",
    },
    componentHealth: regionAPartialBcDegradedHealth,
  },

  // ── Capacity has returned but the restore pace was left at "hold" --
  // holding is safe (no retrigger risk) but makes no progress restoring
  // Region A's own traffic, so Region A is still treated as unrestored
  // for traffic-share purposes. Falls through to whatever
  // failover-management state the candidate already set during the
  // active incident -- see below. (No dedicated rule row needed: the
  // active-incident rules below do not require regionACapacityReturned
  // to be absent, only regionAFailed, so they still match correctly on
  // "hold" after capacity returns.)

  // ── Active-incident states (regionAFailed=true, regionACapacityReturned
  // not yet set). Ordered most-specific first.

  // ── OPTIMAL: failover capped at exactly the critical-traffic level,
  // optional traffic shed, cache and DB both protected. Region B/C absorb
  // only the critical share they can safely carry.
  {
    id: "capacity-managed-full-protection",
    when: {
      triggerEquals: { regionAFailed: true },
      controlEquals: {
        [FAILOVER_CAP_KEY]: 80,
        [LOW_PRIORITY_TRAFFIC_KEY]: "shed",
        [CACHE_PROTECTION_KEY]: "on",
        [DB_CONCURRENCY_KEY]: "capped",
      },
    },
    incidentState: "capacity-managed-full-protection",
    values: {
      regionATrafficPct: 0,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 80,
      shedTrafficPct: 20,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 0,
      regionBApiUtilization: 90,
      regionCApiUtilization: 90,
      regionADbUtilization: 0,
      regionBDbUtilization: 88,
      regionCDbUtilization: 88,
      regionACacheHitRate: 0,
      regionBCacheHitRate: 86,
      regionCCacheHitRate: 86,
      regionACustomerSuccessPct: 0,
      regionBCustomerSuccessPct: 99,
      regionCCustomerSuccessPct: 99,
      globalSuccessRate: 90,
      queueDepth: 150,
      secondRegionRiskStatus: "normal",
      containmentMechanism: "capacity-managed-full",
    },
    componentHealth: regionAFailedHealth,
  },

  // ── ACCEPTABLE: same cap+shed discipline, but only ONE of
  // cache-protection/DB-concurrency is engaged. Genuinely safe right now
  // (no second-region risk, no dropped critical traffic) but carrying
  // real, visible stress on whichever tier was left unprotected.
  {
    id: "capacity-managed-partial-protection-db",
    when: {
      triggerEquals: { regionAFailed: true },
      controlEquals: {
        [FAILOVER_CAP_KEY]: 80,
        [LOW_PRIORITY_TRAFFIC_KEY]: "shed",
        [DB_CONCURRENCY_KEY]: "capped",
        [CACHE_PROTECTION_KEY]: "off",
      },
    },
    incidentState: "capacity-managed-partial-protection",
    values: {
      regionATrafficPct: 0,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 80,
      shedTrafficPct: 20,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 0,
      regionBApiUtilization: 93,
      regionCApiUtilization: 93,
      regionADbUtilization: 0,
      regionBDbUtilization: 90,
      regionCDbUtilization: 90,
      regionACacheHitRate: 0,
      regionBCacheHitRate: 58,
      regionCCacheHitRate: 58,
      regionACustomerSuccessPct: 0,
      regionBCustomerSuccessPct: 94,
      regionCCustomerSuccessPct: 94,
      globalSuccessRate: 85,
      queueDepth: 800,
      secondRegionRiskStatus: "warning",
      containmentMechanism: "capacity-managed-partial",
    },
    componentHealth: regionAFailedDegradedTierHealth("region-b-cache", "region-c-cache"),
  },
  {
    id: "capacity-managed-partial-protection-cache",
    when: {
      triggerEquals: { regionAFailed: true },
      controlEquals: {
        [FAILOVER_CAP_KEY]: 80,
        [LOW_PRIORITY_TRAFFIC_KEY]: "shed",
        [CACHE_PROTECTION_KEY]: "on",
        [DB_CONCURRENCY_KEY]: "uncapped",
      },
    },
    incidentState: "capacity-managed-partial-protection",
    values: {
      regionATrafficPct: 0,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 80,
      shedTrafficPct: 20,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 0,
      regionBApiUtilization: 91,
      regionCApiUtilization: 91,
      regionADbUtilization: 0,
      regionBDbUtilization: 112,
      regionCDbUtilization: 112,
      regionACacheHitRate: 0,
      regionBCacheHitRate: 85,
      regionCCacheHitRate: 85,
      regionACustomerSuccessPct: 0,
      regionBCustomerSuccessPct: 92,
      regionCCustomerSuccessPct: 92,
      globalSuccessRate: 84,
      queueDepth: 1100,
      secondRegionRiskStatus: "warning",
      containmentMechanism: "capacity-managed-partial",
    },
    componentHealth: regionAFailedDegradedTierHealth("region-b-db", "region-c-db"),
  },

  // ── ACCEPTABLE-adjacent but weaker still: cap+shed discipline is
  // correct (critical traffic never dropped, failover bounded to the
  // true critical floor), but NEITHER cache-protection nor DB-concurrency
  // protection has been engaged yet. Both Region B/C tiers carry real,
  // visible stress -- worse than either single-protection variant above,
  // though still meaningfully better than leaving the cap itself
  // unmanaged, since the traffic volume reaching Region B/C is at least
  // bounded to what they were actually asked to carry.
  {
    id: "capacity-managed-no-protection",
    when: {
      triggerEquals: { regionAFailed: true },
      controlEquals: {
        [FAILOVER_CAP_KEY]: 80,
        [LOW_PRIORITY_TRAFFIC_KEY]: "shed",
        [CACHE_PROTECTION_KEY]: "off",
        [DB_CONCURRENCY_KEY]: "uncapped",
      },
    },
    incidentState: "capacity-managed-no-protection",
    values: {
      regionATrafficPct: 0,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 80,
      shedTrafficPct: 20,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 0,
      regionBApiUtilization: 96,
      regionCApiUtilization: 96,
      regionADbUtilization: 0,
      regionBDbUtilization: 118,
      regionCDbUtilization: 118,
      regionACacheHitRate: 0,
      regionBCacheHitRate: 52,
      regionCCacheHitRate: 52,
      regionACustomerSuccessPct: 0,
      regionBCustomerSuccessPct: 85,
      regionCCustomerSuccessPct: 85,
      globalSuccessRate: 78,
      queueDepth: 2100,
      secondRegionRiskStatus: "warning",
      containmentMechanism: "capacity-managed-partial",
    },
    componentHealth: regionAFailedDegradedTierHealth(
      "region-b-cache",
      "region-c-cache",
      "region-b-db",
      "region-c-db",
    ),
  },

  // ── UNSAFE: failover cap set too low (below the 80 needed to cover
  // critical traffic) while optional traffic is NOT being shed. Region
  // B/C look comfortably healthy -- but real critical customer
  // operations are being dropped outright because nothing absorbs the
  // gap between the cap and the critical-traffic floor. A direct
  // violation of "critical customer operations must remain available,"
  // invisible if you only look at Region B/C's own utilization.
  {
    id: "cap-too-low-drops-critical-traffic",
    when: {
      triggerEquals: { regionAFailed: true },
      controlEquals: {
        [FAILOVER_CAP_KEY]: 25,
        [LOW_PRIORITY_TRAFFIC_KEY]: "serve",
      },
    },
    incidentState: "cap-too-low-drops-critical-traffic",
    values: {
      regionATrafficPct: 0,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 25,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 55,
      regionAApiUtilization: 0,
      regionBApiUtilization: 76,
      regionCApiUtilization: 76,
      regionADbUtilization: 0,
      regionBDbUtilization: 72,
      regionCDbUtilization: 72,
      regionACacheHitRate: 0,
      regionBCacheHitRate: 90,
      regionCCacheHitRate: 90,
      regionACustomerSuccessPct: 0,
      regionBCustomerSuccessPct: 100,
      regionCCustomerSuccessPct: 100,
      globalSuccessRate: 72,
      queueDepth: 50,
      secondRegionRiskStatus: "normal",
      containmentMechanism: "uncontained",
    },
    componentHealth: regionAFailedHealth,
  },
  {
    id: "cap-zero-drops-all-critical-traffic",
    when: {
      triggerEquals: { regionAFailed: true },
      controlEquals: { [FAILOVER_CAP_KEY]: 0 },
    },
    incidentState: "cap-zero-drops-all-critical-traffic",
    values: {
      regionATrafficPct: 0,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 0,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 80,
      regionAApiUtilization: 0,
      regionBApiUtilization: 70,
      regionCApiUtilization: 70,
      regionADbUtilization: 0,
      regionBDbUtilization: 65,
      regionCDbUtilization: 65,
      regionACacheHitRate: 0,
      regionBCacheHitRate: 92,
      regionCCacheHitRate: 92,
      regionACustomerSuccessPct: 0,
      regionBCustomerSuccessPct: 100,
      regionCCustomerSuccessPct: 100,
      globalSuccessRate: 60,
      queueDepth: 0,
      secondRegionRiskStatus: "normal",
      containmentMechanism: "uncontained",
    },
    componentHealth: regionAFailedHealth,
  },

  // ── UNSAFE/harmful, the named tempting path: failover left fully
  // uncapped (100, the default) with no shedding and no protection on
  // either tier. The router tries to preserve ALL of Region A's traffic
  // by pushing it onto Region B/C regardless of their real capacity --
  // this is "send all A traffic to B/C." Region B/C are driven toward
  // their OWN failure: DB saturates, cache collapses under cold-key
  // pressure, customer success in BOTH previously-healthy regions drops
  // well below acceptable, and secondRegionRiskStatus goes critical. This
  // is the pressure-transfer mechanism: relieving Region A's outage by
  // maximizing failover measurably worsens Region B and Region C.
  {
    id: "uncapped-failover-overloads-bc",
    when: {
      triggerEquals: { regionAFailed: true },
      controlEquals: {
        [FAILOVER_CAP_KEY]: 100,
        [LOW_PRIORITY_TRAFFIC_KEY]: "serve",
        [CACHE_PROTECTION_KEY]: "off",
        [DB_CONCURRENCY_KEY]: "uncapped",
      },
    },
    incidentState: "uncapped-failover-overloads-bc",
    values: {
      regionATrafficPct: 0,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 100,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 0,
      regionBApiUtilization: 135,
      regionCApiUtilization: 135,
      regionADbUtilization: 0,
      regionBDbUtilization: 150,
      regionCDbUtilization: 150,
      regionACacheHitRate: 0,
      regionBCacheHitRate: 40,
      regionCCacheHitRate: 40,
      regionACustomerSuccessPct: 0,
      regionBCustomerSuccessPct: 55,
      regionCCustomerSuccessPct: 55,
      globalSuccessRate: 37,
      queueDepth: 8000,
      secondRegionRiskStatus: "critical",
      containmentMechanism: "uncontained",
    },
    componentHealth: regionAFailedBcCriticalHealth,
  },

  // ── Fallback while Region A has failed but the candidate has not yet
  // reached any of the specific authored combinations above (e.g. the
  // cap raised partway without pairing it with shedding/protection, or
  // protection toggled before the cap/shed decision). Reflects a
  // partially-managed, still-risky middle ground -- not as bad as fully
  // uncapped-with-nothing, not yet safe.
  {
    id: "failover-active-unmanaged",
    when: { triggerEquals: { regionAFailed: true } },
    incidentState: "failover-active-unmanaged",
    values: {
      regionATrafficPct: 0,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 100,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 0,
      regionBApiUtilization: 118,
      regionCApiUtilization: 118,
      regionADbUtilization: 0,
      regionBDbUtilization: 125,
      regionCDbUtilization: 125,
      regionACacheHitRate: 0,
      regionBCacheHitRate: 55,
      regionCCacheHitRate: 55,
      regionACustomerSuccessPct: 0,
      regionBCustomerSuccessPct: 72,
      regionCCustomerSuccessPct: 72,
      globalSuccessRate: 48,
      queueDepth: 4200,
      secondRegionRiskStatus: "critical",
      containmentMechanism: "uncontained",
    },
    componentHealth: regionAFailedBcDegradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      regionATrafficPct: 50,
      regionBTrafficPct: 25,
      regionCTrafficPct: 25,
      regionAFailoverPct: 0,
      shedTrafficPct: 0,
      regionACriticalTrafficDroppedPct: 0,
      regionAApiUtilization: 70,
      regionBApiUtilization: 70,
      regionCApiUtilization: 70,
      regionADbUtilization: 65,
      regionBDbUtilization: 65,
      regionCDbUtilization: 65,
      regionACacheHitRate: 92,
      regionBCacheHitRate: 92,
      regionCCacheHitRate: 92,
      regionACustomerSuccessPct: 100,
      regionBCustomerSuccessPct: 100,
      regionCCustomerSuccessPct: 100,
      globalSuccessRate: 100,
      queueDepth: 0,
      secondRegionRiskStatus: "normal",
      containmentMechanism: "uncontained",
    },
    componentHealth: healthyHealth,
  },
];

/** Helper: healthyHealth with Region A critical and exactly the two named
 * Region B/C tier nodes degraded (used by the two partial-protection
 * rules above, which stress different tiers depending on which
 * protection control was left off). */
function regionAFailedDegradedTierHealth(
  ...degradedNodeIds: string[]
): Record<string, ComponentHealth> {
  const health: Record<string, ComponentHealth> = { ...regionAFailedHealth };
  for (const nodeId of degradedNodeIds) {
    health[nodeId] = "degraded";
  }
  return health;
}
