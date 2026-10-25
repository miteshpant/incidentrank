import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CACHE_PROTECTION_KEY,
  DB_CONCURRENCY_KEY,
  FAILOVER_CAP_KEY,
  LOW_PRIORITY_TRAFFIC_KEY,
  REGION_A_RESTORATION_KEY,
  TRAFFIC_RESTORE_PACE_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only -- never read by resolution logic. Every meaningful
 * rule carries `feedback` describing the system consequence. Ids are
 * stable and intentionally neutral, never self-descriptive of the
 * authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: FAILOVER_CAP_KEY,
    valueEquals: 100,
    whenTriggerEquals: { regionAFailed: true },
    outcome: "harmful",
    feedback: {
      title: "Left automatic failover uncapped",
      explanation:
        "Leaving the failover cap at 100 lets the router try to preserve all of Region A's lost traffic by pushing it onto Region B and Region C regardless of their real spare capacity. Region B and Region C's API and database utilization are now climbing toward their own limits, cache hit rates have collapsed under cold-key pressure from the redirected traffic, and both regions' own customer success rates have dropped sharply -- the single-region incident is actively becoming a global one.",
    },
  },
  {
    id: "acr_2",
    controlKey: FAILOVER_CAP_KEY,
    valueEquals: 80,
    whenTriggerEquals: { regionAFailed: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped failover at the critical-traffic floor",
      explanation:
        "Capping automatic failover at 80% matches the business-critical share of Region A's original traffic, so Region B and Region C only absorb exactly the load they are being asked to carry on the business's behalf -- no more. Paired with shedding the remaining optional traffic, this keeps Region B and Region C's utilization within a safe operating range instead of climbing toward their own failure point.",
    },
  },
  {
    id: "acr_3",
    controlKey: FAILOVER_CAP_KEY,
    valueAtMost: 50,
    whenTriggerEquals: { regionAFailed: true },
    outcome: "harmful",
    feedback: {
      title: "Capped failover below the critical-traffic floor",
      explanation:
        "Setting the failover cap below 80 while optional traffic is still being served means real business-critical customer operations now have nowhere to go -- neither Region A (still offline) nor Region B/C (blocked by the cap) can serve them. Region B and Region C look comfortably healthy on their own utilization metrics, but that is misleading: critical traffic is being dropped outright, not relieved.",
    },
  },
  {
    id: "acr_4",
    controlKey: LOW_PRIORITY_TRAFFIC_KEY,
    valueEquals: "shed",
    whenTriggerEquals: { regionAFailed: true },
    outcome: "beneficial",
    feedback: {
      title: "Shed optional traffic instead of forwarding it",
      explanation:
        "Shedding Region A's optional/low-priority traffic frees exactly the capacity needed to keep the business-critical share within the failover cap, without having to raise the cap itself and expose Region B/C to more load than necessary. This is the traffic the business explicitly said may be sacrificed.",
    },
  },
  {
    id: "acr_5",
    controlKey: CACHE_PROTECTION_KEY,
    valueEquals: "on",
    whenTriggerEquals: { regionAFailed: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled cache protection in Region B/C",
      explanation:
        "Enabling cache protection collapses concurrent misses on the same cold key into a single origin fetch instead of letting every one of them stampede through to the database. Region B and Region C's cache hit rates recover measurably and their database tiers see materially less pressure from the failover traffic they are legitimately absorbing.",
    },
  },
  {
    id: "acr_6",
    controlKey: DB_CONCURRENCY_KEY,
    valueEquals: "capped",
    whenTriggerEquals: { regionAFailed: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped database concurrency in Region B/C",
      explanation:
        "Capping database connection concurrency converts the excess load from failover traffic into bounded request queuing at the API tier instead of letting it saturate Region B/C's database tier directly. Database utilization in both regions drops to a sustainable level.",
    },
  },
  {
    id: "acr_7",
    controlKey: TRAFFIC_RESTORE_PACE_KEY,
    valueEquals: "instant",
    whenTriggerEquals: { regionACapacityReturned: true },
    outcome: "harmful",
    feedback: {
      title: "Restored traffic to Region A instantly",
      explanation:
        "Restoring Region A's full traffic share the instant it reports recovered capacity ignores whether Region B and Region C have actually finished draining the queue and re-warming the caches they built up during the failover window. The traffic shift itself re-floods Region B/C's still-recovering tiers -- second-region risk has gone critical again, even though Region A's own health genuinely recovered first.",
    },
  },
  {
    id: "acr_8",
    controlKey: TRAFFIC_RESTORE_PACE_KEY,
    valueEquals: "gradual",
    whenTriggerEquals: { regionACapacityReturned: true },
    outcome: "beneficial",
    feedback: {
      title: "Restored traffic to Region A gradually",
      explanation:
        "Restoring traffic gradually lets Region B and Region C's queue and cache actually finish draining before more load shifts away from them, rather than snapping back to the pre-incident traffic split the instant Region A reports capacity. Combined with waiting for the drain window to elapse, this reaches a fully recovered state without re-triggering the overload.",
    },
  },
  {
    id: "acr_9",
    controlKey: REGION_A_RESTORATION_KEY,
    valueEquals: "full",
    whenTriggerEquals: { regionAFailed: false },
    outcome: "neutral",
    feedback: {
      title: "Marked Region A fully restored before any incident",
      explanation:
        "Changing Region A's restoration mode before Region A has actually failed has no effect yet -- there is no degraded capacity to restore. This control only matters once Region A has genuinely gone down.",
    },
  },
  {
    id: "acr_10",
    controlKey: REGION_A_RESTORATION_KEY,
    valueEquals: "partial",
    whenTriggerEquals: { regionACapacityReturned: true },
    outcome: "beneficial",
    feedback: {
      title: "Declared Region A only partially restored",
      explanation:
        "Declaring Region A's restoration mode as \"partial\" once it reports recovered capacity hands back only half of Region A's original traffic share instead of all of it, leaving the rest safely on the already-managed failover path. This is a genuinely smaller, lower-risk traffic shift than restoring Region A to \"full\" immediately -- Region B and Region C give back proportionally less headroom, so they stay comfortably within capacity even before their drain window has fully elapsed. Pairing this with an instant restore pace still re-floods Region B/C with whatever share is being shifted, just a smaller flood than a full-restoration instant shift would cause.",
    },
  },
  {
    id: "acr_11",
    controlKey: REGION_A_RESTORATION_KEY,
    valueEquals: "offline",
    whenTriggerEquals: { regionACapacityReturned: true },
    outcome: "harmful",
    feedback: {
      title: "Left Region A's restoration mode at offline after capacity returned",
      explanation:
        "Region A reporting recovered capacity does not restore any traffic by itself -- the candidate must actively declare a restoration mode (\"partial\" or \"full\"). Leaving this control at its \"offline\" default means Region A continues to be treated as fully offline for traffic-share purposes no matter how the restore pace is set, and the incident's failover-management state from the active window carries forward unchanged.",
    },
  },
];
