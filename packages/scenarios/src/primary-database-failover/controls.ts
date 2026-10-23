import type { ControlDefinition } from "@incidentrank/simulator";

/** Initiates the failover sequence at all. Leaving this off means the
 * candidate is simply waiting on the degraded/unavailable original
 * primary — no promotion, no fencing, no routing change happens. */
export const FAILOVER_INITIATED_KEY = "failoverInitiated";

/** Governs WHEN promotion is allowed to complete relative to replication
 * lag. "waitForLagDrain" holds promotion until the replica's replication
 * lag has drained to near-zero, guaranteeing the promoted replica has
 * every write the old primary had accepted. "immediate" promotes as soon
 * as failover is initiated, regardless of how much lag remains — this is
 * the scenario's core availability-vs-correctness lever: immediate
 * promotion restores availability fastest but can promote a replica that
 * is missing recently committed writes. */
export const PROMOTION_TIMING_KEY = "promotionTiming";

/** Fences the old primary at the moment of promotion: revokes its
 * ability to accept further writes (e.g. via a STONITH-style isolation
 * or a hard revoke at the proxy/network layer) so it can never again
 * diverge from the newly promoted replica. Without fencing, a reachable
 * old primary can still accept writes from any client/connection that
 * has not yet been redirected, risking two nodes both accepting writes
 * at once. */
export const OLD_PRIMARY_FENCING_KEY = "oldPrimaryFencing";

/** Drains in-flight connections/transactions against the old primary
 * before the DB Proxy cuts traffic over, rather than severing them
 * mid-transaction. Protects in-flight writes at the cost of a short
 * extra delay before the cutover completes. */
export const CONNECTION_DRAIN_KEY = "connectionDrain";

/** The DB Proxy's write-routing policy. "oldPrimary" is the pre-incident
 * default; "newPrimary" cuts write traffic over to the promoted replica.
 * Leaving this on "oldPrimary" after promotion means writes keep
 * targeting a node that may be unreachable, fenced, or no longer
 * authoritative. */
export const WRITE_ROUTING_POLICY_KEY = "writeRoutingPolicy";

/** Read replica fleet size. More replicas add read capacity/headroom
 * during the incident and raise infrastructure cost, but by itself does
 * nothing about the primary being unavailable for writes — a realistic
 * but non-decisive control. */
export const REPLICA_COUNT_KEY = "replicaCount";

export const controls: ControlDefinition[] = [
  {
    key: FAILOVER_INITIATED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: PROMOTION_TIMING_KEY,
    allowedValues: ["immediate", "waitForLagDrain"],
    initialValue: "immediate",
  },
  {
    key: OLD_PRIMARY_FENCING_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CONNECTION_DRAIN_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: WRITE_ROUTING_POLICY_KEY,
    allowedValues: ["oldPrimary", "newPrimary"],
    initialValue: "oldPrimary",
  },
  {
    key: REPLICA_COUNT_KEY,
    allowedValues: [1, 2, 3],
    initialValue: 1,
  },
];
