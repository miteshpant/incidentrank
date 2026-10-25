import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Throttles the concentrated hot-tenant traffic responsible for Shard
 * 2's load, specifically (not all Shard 2 traffic, and not any other
 * shard). "off" (default) applies no throttling. "moderate" trims
 * bursts without materially reducing sustained volume. "strict" caps
 * the hot tenant's own request rate hard -- the direct, business-
 * sanctioned tradeoff ("temporary throttling of one tenant is
 * acceptable to protect the platform") that relieves Shard 2 Primary
 * write pressure, which is the prerequisite for replica lag actually
 * draining.
 */
export const HOT_TENANT_THROTTLE_KEY = "hotTenantThrottle";

/**
 * Scales API fleet concurrency/instance count. "normal" (default) is
 * the baseline capacity. "high" adds materially more concurrent
 * connections -- the scenario's required pressure-transfer trap: more
 * API concurrency means more concurrent connections opened against the
 * SAME hot Shard 2 Primary (every shard is reached through the one
 * Shard Router, so added API capacity does not change which shard a
 * hot tenant's traffic lands on). This measurably WORSENS Shard 2
 * Primary queue depth/latency rather than helping, and does nothing for
 * replica lag.
 */
export const API_CONCURRENCY_KEY = "apiConcurrency";

/**
 * Reprioritizes the replication stream's own worker/bandwidth budget
 * toward Shard 2 specifically. "normal" (default) applies no special
 * priority. "prioritized" dedicates more of the shared replication
 * capacity to Shard 2's replica, which is what actually accelerates
 * lag draining once Shard 2 Primary's write pressure has already been
 * reduced -- prioritizing replication alone, with primary pressure
 * still high, has only a small effect, since the replica cannot catch
 * up faster than the primary's write rate allows it to meaningfully
 * apply the backlog it already has queued.
 */
export const REPLICA_CATCHUP_PRIORITY_KEY = "replicaCatchUpPriority";

/**
 * Promotes Shard 2's replica to primary authority. "false" (default)
 * leaves Shard 2 Primary as the sole write authority. "true" promotes
 * the replica immediately, regardless of its current replication
 * position. This is the scenario's central, named trap: failing over
 * while the replica is meaningfully behind the primary means
 * acknowledged writes the old primary already confirmed to clients may
 * never have reached the replica -- once the replica takes over as
 * authoritative, those writes are gone from the new authoritative
 * copy, a real, counted, non-self-resetting historical loss (see
 * metrics.ts's shard2StrandedAcknowledgedWriteCount). The replica's own
 * PROCESS health can read "healthy" the entire time this is happening
 * -- process health only reflects "is the replica process up and
 * responding," never "is the replica's data caught up enough to be
 * trusted with write authority."
 */
export const FAILOVER_SHARD2_KEY = "failoverShard2";

/**
 * Where read traffic for Shard 2 is routed. "primary-only" (default)
 * serves every read from Shard 2 Primary -- always fresh, but does
 * nothing to relieve primary load. "replica-allowed" permits reads to
 * be served from Shard 2's replica once its lag is within the authored
 * staleness bound, trading a small, explicitly bounded amount of read
 * staleness for real primary read-load relief. Allowing replica reads
 * while lag is UNBOUNDED (far past the authored tolerance) is itself a
 * real violation of "stale reads may be tolerated only within the
 * authored bound," distinct from the failover trap.
 */
export const READ_ROUTING_KEY = "readRouting";

/**
 * Throttles ALL write volume specifically against Shard 2 Primary
 * (distinct from hot-tenant throttling, which targets only the
 * concentrated tenant's own traffic). "off" (default) applies no
 * additional write throttling. "on" caps Shard 2 Primary's total write
 * acceptance rate -- a blunter, platform-wide-on-this-shard lever that
 * also relieves primary pressure, but at the cost of throttling every
 * tenant on Shard 2, not just the hot one.
 */
export const WRITE_THROTTLE_SHARD2_KEY = "writeThrottleShard2";

/**
 * Initiates reconciliation/replay of the historically stranded
 * acknowledged-write backlog left behind by an unsafe failover. "off"
 * (default) leaves the stranded-write count exactly where it was left
 * -- fixing the live configuration (promoting back correctly, or never
 * having failed over unsafely in the first place) does NOT, by itself,
 * reconcile writes already stranded on the now-demoted former primary.
 * "active" begins a real, rate-limited replay of the stranded backlog
 * against the new authoritative copy, draining
 * shard2StrandedAcknowledgedWriteCount gradually over real elapsed
 * simulated time -- never instantly -- while new unsafe failovers are
 * not occurring.
 */
export const RECONCILE_STRANDED_WRITES_KEY = "reconcileStrandedWrites";

export const controls: ControlDefinition[] = [
  {
    key: HOT_TENANT_THROTTLE_KEY,
    allowedValues: ["off", "moderate", "strict"],
    initialValue: "off",
  },
  {
    key: API_CONCURRENCY_KEY,
    allowedValues: ["normal", "high"],
    initialValue: "normal",
  },
  {
    key: REPLICA_CATCHUP_PRIORITY_KEY,
    allowedValues: ["normal", "prioritized"],
    initialValue: "normal",
  },
  {
    key: FAILOVER_SHARD2_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: READ_ROUTING_KEY,
    allowedValues: ["primary-only", "replica-allowed"],
    initialValue: "primary-only",
  },
  {
    key: WRITE_THROTTLE_SHARD2_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: RECONCILE_STRANDED_WRITES_KEY,
    allowedValues: ["off", "active"],
    initialValue: "off",
  },
];
