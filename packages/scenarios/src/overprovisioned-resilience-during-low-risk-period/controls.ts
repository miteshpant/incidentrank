import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Compute-side standby capacity (Service Fleet). "peak-event" (default,
 * the inherited expensive posture) runs 3x the baseline instance count
 * at all times — appropriate during the high-risk window, pure waste
 * once it has ended. "baseline-operating" (2x) is this scenario's stated
 * operating baseline — business invariant #4 ("risk posture may be
 * lowered only to the stated operating baseline"): a real, meaningful
 * cost reduction with zero resilience consequence, since nothing in
 * this scenario's mandatory floor depends on compute replica count at
 * all. "minimum" (1x, no standby at all) goes BELOW the stated
 * baseline — not itself a floor violation (the floor is about AZ/failover/
 * backup posture, not raw instance count), but it does remove the
 * standby headroom that absorbs ordinary traffic variance, so it is
 * priced as a real (if modest) availability-risk cost in its own right,
 * distinct from the mandatory-floor violations below.
 */
export const REPLICA_COUNT_KEY = "replicaCount";

/**
 * Pre-warmed/idle compute capacity held in reserve purely to absorb a
 * sudden demand spike without a cold-start delay. "full" (default) is
 * the peak-event posture. "reduced" lowers it to the operating baseline
 * — a real cost saving, with a real but bounded tradeoff: a sudden
 * demand spike (which is no longer expected now that the high-risk
 * window has ended) would see a brief cold-start latency bump instead
 * of none at all. "none" removes it entirely — cheapest, and still not
 * itself a mandatory-floor violation, but stacks with a thin replica
 * count to materially worsen ordinary-traffic headroom.
 */
export const WARM_CAPACITY_KEY = "warmCapacity";

/**
 * THE central mandatory-floor lever. "active-active" (default) runs
 * genuine multi-AZ redundancy: every zone independently carries enough
 * capacity to absorb another zone's traffic if that zone fails.
 * "single-az-with-standby" keeps a second zone warm as a passive
 * failover target rather than fully active — this is the scenario's
 * stated operating baseline (invariant #4) once the high-risk window
 * has ended: real cost savings, and the mandatory floor (invariant #2:
 * "single-zone failure tolerance may not be removed if policy
 * requires it") is still satisfied, because a failing zone still has
 * somewhere safe to fail over to. "single-az-only" removes the second
 * zone's standby capacity entirely — this is the scenario's central
 * forbidden lever: everything reads healthy right now (no zone has
 * actually failed), but it drops below the mandatory single-zone
 * failure-tolerance floor. See timed-events.ts's periodic AZ-failure
 * drill: the floor exists specifically to protect against that
 * authored, real (if infrequent) event, and removing it below the
 * floor is genuinely unsafe, not merely "against policy on paper."
 */
export const MULTI_AZ_MODE_KEY = "multiAzMode";

/**
 * Capacity explicitly reserved so that IF a failover is ever triggered,
 * the surviving zone(s) can actually absorb the failed zone's traffic
 * without themselves collapsing. "peak-reserved" (default) holds enough
 * reserve for the full peak-event traffic profile — real money, real
 * waste once the high-risk window has ended. "baseline-reserved" holds
 * enough reserve for the stated normal-traffic failover profile — this
 * is the other half of the mandatory floor alongside multiAzMode: as
 * long as SOME real reserve is held, a failover drill can actually be
 * absorbed. "none" releases all failover reserve — combined with any
 * multiAzMode setting, this means that even if a failover technically
 * has somewhere to go, there is no longer any spare capacity to serve
 * the redirected traffic once it arrives, which is just as unsafe as
 * removing the failover target itself.
 */
export const FAILOVER_RESERVE_KEY = "failoverReserve";

/**
 * A standing fleet of fully-provisioned, idle service instances held
 * purely as an instant-failover pool (distinct from warmCapacity's
 * cold-start buffer — standby fleet instances are pre-registered and
 * health-checked, ready to take production traffic with zero startup
 * delay at all). "full" (default) is the peak-event posture. "reduced"
 * is a real cost saving that keeps a smaller but nonzero standby pool —
 * genuinely fine, since the mandatory floor does not require a specific
 * standby-fleet size, only that failover HAS somewhere safe and
 * resourced to go (multiAzMode + failoverReserve). "none" saves the
 * most, and does not by itself violate the mandatory floor either — but
 * stacking "none" here with a thin failoverReserve compounds the risk
 * that a genuine failover event could not actually be served smoothly.
 */
export const STANDBY_FLEET_KEY = "standbyFleet";

/**
 * Database Primary's provisioned instance class. "peak-sized" (default)
 * is sized for the high-risk window's write volume. "baseline-sized" is
 * the stated operating baseline — real savings, with zero correctness
 * or durability consequence, since write volume itself has already
 * returned to normal (this incident is purely about posture, not an
 * active traffic event). "undersized" goes below even the baseline
 * write-volume need — not a mandatory-floor violation by itself (the
 * floor in this scenario is about AZ/failover posture, not raw DB
 * sizing), but a real, distinct performance-risk cost of its own: query
 * latency and replication-apply throughput both degrade once genuine
 * baseline write volume resumes.
 */
export const DATABASE_REPLICA_CLASS_KEY = "databaseReplicaClass";

/**
 * How often the Database Primary takes a full backup. "high-frequency"
 * (default) was appropriate during the high-risk window (minimizing
 * potential data loss window during a period when the system was
 * already under elevated risk). "standard" is the stated operating
 * baseline — a real, modest storage/compute cost saving with a bounded,
 * accepted increase in the recovery-point window, never a durability
 * guarantee violation. "minimal" drops backup frequency low enough that
 * the durability guarantee this scenario's invariants require (backups
 * must still occur often enough to bound data loss within policy) is
 * genuinely violated — cheapest of the three, completely invisible on
 * every live health/availability metric, and a real, distinct
 * authored-floor violation independent of the AZ/failover floor above.
 */
export const BACKUP_FREQUENCY_KEY = "backupFrequency";

/**
 * Pre-warmed read-path cache capacity sized for peak-event read
 * concurrency. "peak-sized" (default) is the expensive posture.
 * "baseline-sized" is the stated operating baseline — real savings with
 * no correctness risk (cache capacity affects latency/hit-rate, never
 * durability or failover safety). "minimal" saves the most, and is
 * still not a mandatory-floor violation — but it does measurably raise
 * Read Replica load (more cache misses fall through), a real, distinct,
 * non-floor performance cost, included so a candidate cannot assume
 * "cheapest setting on every control" is free of ANY consequence even
 * on the controls that are not part of the mandatory floor.
 */
export const PREWARMED_CACHE_CAPACITY_KEY = "prewarmedCacheCapacity";

export const controls: ControlDefinition[] = [
  {
    key: REPLICA_COUNT_KEY,
    allowedValues: ["peak-event", "baseline-operating", "minimum"],
    initialValue: "peak-event",
  },
  {
    key: WARM_CAPACITY_KEY,
    allowedValues: ["full", "reduced", "none"],
    initialValue: "full",
  },
  {
    key: MULTI_AZ_MODE_KEY,
    allowedValues: ["active-active", "single-az-with-standby", "single-az-only"],
    initialValue: "active-active",
  },
  {
    key: FAILOVER_RESERVE_KEY,
    allowedValues: ["peak-reserved", "baseline-reserved", "none"],
    initialValue: "peak-reserved",
  },
  {
    key: STANDBY_FLEET_KEY,
    allowedValues: ["full", "reduced", "none"],
    initialValue: "full",
  },
  {
    key: DATABASE_REPLICA_CLASS_KEY,
    allowedValues: ["peak-sized", "baseline-sized", "undersized"],
    initialValue: "peak-sized",
  },
  {
    key: BACKUP_FREQUENCY_KEY,
    allowedValues: ["high-frequency", "standard", "minimal"],
    initialValue: "high-frequency",
  },
  {
    key: PREWARMED_CACHE_CAPACITY_KEY,
    allowedValues: ["peak-sized", "baseline-sized", "minimal"],
    initialValue: "peak-sized",
  },
];
