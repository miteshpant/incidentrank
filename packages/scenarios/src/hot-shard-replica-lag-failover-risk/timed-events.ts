import type { TimedEvent } from "@incidentrank/simulator";

// A concentrated hot tenant begins driving load onto Shard 2
// specifically (the other three shards are unaffected the entire
// incident unless the candidate broadly scales API concurrency). This
// is the first, directly observable symptom: Shard 2 Primary's request
// rate/latency/queue climb while 1/3/4 stay flat.
const HOT_SHARD_ONSET_MS = 30_000;

// Shortly after, Shard 2's replica begins falling behind -- a
// CORRELATED consequence of the same hot-tenant write pressure on
// Shard 2 Primary (not an independent event), which is what makes the
// misleading "replica looks healthy" signal dangerous: the replica
// process never stops responding to health checks even as its
// replication position falls further behind.
const REPLICA_LAG_ONSET_MS = HOT_SHARD_ONSET_MS + 15_000;

// A later checkpoint used to prove the stranded-acknowledged-write
// HISTORICAL counter keeps climbing the longer an unsafe failover
// stays in effect -- a real, growing accumulation of damage, not a
// one-time flat penalty. rules.ts authors a higher
// shard2StrandedAcknowledgedWriteCount for the matched rule once this
// trigger has fired than it does right at failover time, for the
// exact same unsafe control combination.
const UNSAFE_FAILOVER_SUSTAINED_MS = REPLICA_LAG_ONSET_MS + 90_000;

// Recovery-lag gate (phase6d.2.md section 9/12): replica lag does not
// drain the instant primary pressure is relieved. `lagDrainWindowElapsed`
// fires a fixed number of simulated minutes after lag onset. rules.ts
// gates the fully-caught-up values on THIS trigger AND on primary
// write pressure having actually been reduced -- a candidate who never
// relieves Shard 2 Primary pressure never reaches the caught-up values
// at all, no matter how much simulated time passes.
const LAG_DRAIN_WINDOW_ELAPSED_MS = REPLICA_LAG_ONSET_MS + 3 * 60_000;

// A second, later checkpoint used specifically to prove the
// stranded-acknowledged-write reconciliation process (triggered by
// RECONCILE_STRANDED_WRITES_KEY="active") drains gradually over real
// elapsed simulated time rather than instantly -- mirroring
// lagDrainWindowElapsed's role for replica catch-up, but for the
// historical-damage backlog specifically. Fires well after
// lagDrainWindowElapsed so a candidate who engaged reconciliation
// early observes a real, multi-stage drain (see rules.ts's
// "unsafe-failover-reconciling-early" vs "...-drained" pair).
const RECONCILIATION_WINDOW_ELAPSED_MS = LAG_DRAIN_WINDOW_ELAPSED_MS + 4 * 60_000;

// Natural-recovery window: if left alone entirely, the hot-tenant burst
// itself eventually subsides on its own schedule. This does NOT
// retroactively undo any stranded-write damage accrued from an unsafe
// failover during the window it was active.
const HOT_TENANT_BURST_SUBSIDED_MS = HOT_SHARD_ONSET_MS + 8 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "hot-shard-onset",
    atMs: HOT_SHARD_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "A concentrated high-volume tenant has begun driving a disproportionate share of traffic onto Shard 2. Shard 2 Primary request rate, write latency, and queue depth are climbing; Shards 1/3/4 remain unaffected.",
    setTriggers: { hotShardActive: true },
  },
  {
    id: "replica-lag-onset",
    atMs: REPLICA_LAG_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "Shard 2's replica has begun falling behind the primary's write stream. The replica process itself continues to report healthy on every health check.",
    setTriggers: { hotShardActive: true, replicaLagActive: true },
  },
  // NOTE: ordered strictly by ascending atMs -- tickOnce processes
  // timedEvents purely by array position, never by sorting atMs
  // itself, so an out-of-order array would silently stall a
  // chronologically-earlier event behind an earlier-indexed-but-
  // later-firing one.
  {
    id: "unsafe-failover-sustained",
    atMs: UNSAFE_FAILOVER_SUSTAINED_MS,
    type: "TRIGGER_SET",
    message:
      "Replica lag remains outside the safe promotion threshold. Any write authority currently held by an unsafely-promoted replica continues to accumulate stranded acknowledged writes.",
    setTriggers: {
      hotShardActive: true,
      replicaLagActive: true,
      unsafeFailoverSustained: true,
    },
  },
  {
    id: "lag-drain-window-elapsed",
    atMs: LAG_DRAIN_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for Shard 2's replica to catch up fully, provided primary write pressure has actually been brought back within safe bounds.",
    setTriggers: {
      hotShardActive: true,
      replicaLagActive: true,
      lagDrainWindowElapsed: true,
    },
  },
  {
    id: "reconciliation-window-elapsed",
    atMs: RECONCILIATION_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for an active stranded-write reconciliation pass to have materially drained its backlog, provided it was actually turned on.",
    setTriggers: {
      hotShardActive: true,
      replicaLagActive: true,
      lagDrainWindowElapsed: true,
      reconciliationWindowElapsed: true,
    },
  },
  {
    id: "hot-tenant-burst-subsided",
    atMs: HOT_TENANT_BURST_SUBSIDED_MS,
    type: "TRIGGER_SET",
    message:
      "The concentrated hot-tenant traffic burst has subsided on its own schedule. This does not undo any acknowledged writes already stranded by an unsafe failover during the incident.",
    setTriggers: {
      hotShardActive: false,
      replicaLagActive: true,
      lagDrainWindowElapsed: true,
      reconciliationWindowElapsed: true,
    },
  },
];

export {
  HOT_SHARD_ONSET_MS,
  REPLICA_LAG_ONSET_MS,
  UNSAFE_FAILOVER_SUSTAINED_MS,
  LAG_DRAIN_WINDOW_ELAPSED_MS,
  RECONCILIATION_WINDOW_ELAPSED_MS,
  HOT_TENANT_BURST_SUBSIDED_MS,
};
