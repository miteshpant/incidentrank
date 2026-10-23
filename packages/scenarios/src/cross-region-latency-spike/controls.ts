import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Where a user's requests are served from. "nearest" keeps each region
 * serving its own users locally wherever the data model allows it.
 * "alwaysGlobal" forces every request through the shared cross-region
 * path (Global Services) regardless of which region the user is in —
 * the opposite of locality, and the one lever that keeps the candidate
 * fully exposed to the degraded inter-region RTT even for traffic that
 * never needed to cross the link at all.
 */
export const TRAFFIC_LOCALITY_KEY = "trafficLocality";

/**
 * The cross-region consistency model applied to the general (non-payment)
 * data path. "synchronous" requires every write to be acknowledged by
 * both regions before it is considered committed — maximal correctness,
 * but every write's latency is bounded below by the current inter-region
 * RTT. "eventual" commits locally first and replicates asynchronously —
 * regional write/read latency recovers close to normal, at the cost of a
 * bounded, authored replication-lag window during which the two regions'
 * copies of that data may disagree. This control does NOT apply to
 * payment authorization, which is governed separately by
 * paymentAuthConsistencyMode below — the business constraint the
 * briefing states explicitly.
 */
export const GENERAL_CONSISTENCY_MODE_KEY = "generalConsistencyMode";

/**
 * The cross-region consistency model applied SPECIFICALLY to payment
 * authorization. The business requires this operation to remain
 * synchronous — authorizing the same payment independently in both
 * regions during a network partition risks a double authorization no
 * engineer can safely take back. "synchronous" (initial) is the only
 * safe value; setting this to "eventual" is the one genuinely unsafe
 * move this scenario models, regardless of how healthy every other
 * metric looks afterward.
 */
export const PAYMENT_AUTH_CONSISTENCY_MODE_KEY = "paymentAuthConsistencyMode";

/**
 * Where reads are served from for region-local (non-payment) data.
 * "localRegion" serves reads from the requesting user's own regional
 * replica — fast, but only as fresh as the current replication lag under
 * eventual consistency. "primaryRegion" always reads from whichever
 * region is currently primary for that data, which is maximally fresh
 * but means every read pays the current cross-region RTT if the reading
 * user is not in the primary region.
 */
export const READ_ROUTING_KEY = "readRouting";

/**
 * Whether the general (non-payment) request path is allowed to make a
 * synchronous cross-region call at all. "required" keeps every request
 * waiting on a live round trip to the other region's service regardless
 * of consistency mode. "localOnly" removes that synchronous cross-region
 * call from the general path entirely, relying on asynchronous
 * replication to keep the other region eventually caught up instead.
 */
export const CROSS_REGION_DEPENDENCY_KEY = "crossRegionDependencyUsage";

/**
 * Temporarily treats one region as the sole primary for all traffic,
 * routing the other region's users through it instead of serving them
 * locally. Intended for a genuine regional outage, not a latency
 * problem between two individually healthy regions — forcing one
 * region's users through a long round trip to the other region's
 * primary adds a full cross-region RTT to every one of their requests,
 * on top of whatever the backbone issue is already costing.
 */
export const REGIONAL_FAILOVER_KEY = "regionalFailover";

export const controls: ControlDefinition[] = [
  {
    key: TRAFFIC_LOCALITY_KEY,
    allowedValues: ["nearest", "alwaysGlobal"],
    initialValue: "nearest",
  },
  {
    key: GENERAL_CONSISTENCY_MODE_KEY,
    allowedValues: ["synchronous", "eventual"],
    initialValue: "synchronous",
  },
  {
    key: PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
    allowedValues: ["synchronous", "eventual"],
    initialValue: "synchronous",
  },
  {
    key: READ_ROUTING_KEY,
    allowedValues: ["localRegion", "primaryRegion"],
    initialValue: "primaryRegion",
  },
  {
    key: CROSS_REGION_DEPENDENCY_KEY,
    allowedValues: ["required", "localOnly"],
    initialValue: "required",
  },
  {
    key: REGIONAL_FAILOVER_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
