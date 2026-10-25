import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BATCHING_MODE_KEY,
  READ_ROUTING_KEY,
  REPLICA_COUNT_KEY,
  REPLICATION_WORKER_COUNT_KEY,
  TRAFFIC_PRIORITY_KEY,
  WRITE_THROTTLE_LEVEL_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "write-clients": "healthy",
  "primary-database": "healthy",
  "replication-stream": "healthy",
  "replica-fleet": "healthy",
  "read-clients": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "write-clients": "healthy",
  "primary-database": "degraded",
  "replication-stream": "degraded",
  "replica-fleet": "degraded",
  "read-clients": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "write-clients": "degraded",
  "primary-database": "critical",
  "replication-stream": "critical",
  "replica-fleet": "critical",
  "read-clients": "degraded",
};

const primaryOverloadedHealth: Record<string, ComponentHealth> = {
  "write-clients": "degraded",
  "primary-database": "critical",
  "replication-stream": "degraded",
  "replica-fleet": "degraded",
  "read-clients": "degraded",
};

const readsIsolatedHealth: Record<string, ComponentHealth> = {
  "write-clients": "healthy",
  "primary-database": "degraded",
  "replication-stream": "critical",
  "replica-fleet": "critical",
  "read-clients": "healthy",
};

/**
 * Authored rule table for Replication Backlog, ordered most-specific
 * first. Write volume has risen above what the replication stream can
 * apply, and the backlog (replicationLagMs, staleReadAgeMs) grows
 * continuously, not as a one-time spike, for as long as it goes
 * unaddressed. There is no single obviously-optimal control: the
 * candidate must choose which of three things to protect —
 *
 *   (a) consistency / replica freshness — throttle writes at the
 *       primary so accepted write volume falls back within sustainable
 *       replication capacity. Real modeled cost: writeAcceptanceRate
 *       drops directly with throttle level.
 *   (b) read freshness specifically — route reads needing fresh data to
 *       the primary instead of the lagging replica. Real modeled cost:
 *       primary load/latency rises, and the backlog itself (replication
 *       lag) is untouched — this protects readers, not the replication
 *       pipeline.
 *   (c) ingest throughput — raise replication worker parallelism and
 *       use compressed batching to raise the replica's apply rate
 *       without throttling writes. Real modeled ceiling: workers alone
 *       cannot fully outrun write volume that structurally exceeds
 *       capacity, and network/storage pressure caps how far batching
 *       alone can help.
 *
 * Two durable traps exist: shipping larger uncompressed batches to
 * "catch up faster" spikes network pressure and makes lag worse, and
 * adding replicas while already backlogged adds another replication
 * fan-out consumer competing for the same constrained stream rather
 * than relieving it.
 */
export const replicationBacklogRules: Rule[] = [
  // ── Harmful: large uncompressed batches while a write surge is
  // active. The attempt to "ship faster" by sending bigger batches
  // without compression multiplies the network bytes the replication
  // stream has to move per applied write, so network pressure spikes
  // and lag gets WORSE than the unmitigated baseline, even though the
  // intent was to help throughput.
  {
    id: "large-uncompressed-batch-worsens-lag",
    when: {
      triggerEquals: { writeSurgeActive: true },
      controlEquals: { [BATCHING_MODE_KEY]: "large-uncompressed-batch" },
    },
    incidentState: "batch-overload",
    values: {
      writeThroughputPerSec: 4_800,
      writeAcceptanceRate: 100,
      replicationLagMs: 42_000,
      replicaApplyRatePerSec: 1_400,
      staleReadAgeMs: 41_500,
      networkPressure: 95,
      storagePressure: 70,
      primaryStatus: "critical",
      replicationHealth: "backlogged",
    },
    componentHealth: criticalHealth,
  },

  // ── Harmful: adding replicas while already backlogged. Each
  // additional replica is another consumer of the primary's
  // already-constrained replication fan-out bandwidth, so lag and
  // network pressure both get worse, not better, than the unmitigated
  // baseline.
  {
    id: "added-replicas-worsens-fanout",
    when: {
      triggerEquals: { writeSurgeActive: true },
      controlAtLeast: { [REPLICA_COUNT_KEY]: 2 },
      controlEquals: { [WRITE_THROTTLE_LEVEL_KEY]: "none" },
    },
    incidentState: "fanout-overload",
    values: {
      writeThroughputPerSec: 4_800,
      writeAcceptanceRate: 100,
      replicationLagMs: 38_000,
      replicaApplyRatePerSec: 1_300,
      staleReadAgeMs: 37_500,
      networkPressure: 90,
      storagePressure: 65,
      primaryStatus: "critical",
      replicationHealth: "backlogged",
    },
    componentHealth: criticalHealth,
  },

  // ── Harmful: routing reads to the primary without throttling writes
  // at all, under sustained write surge. The primary now absorbs the
  // full write load AND the full read load at once — read freshness is
  // protected in principle, but the primary itself becomes the
  // bottleneck and customer-facing latency explodes. This is worse than
  // the isolated read-routing tradeoff below because nothing is taking
  // pressure off the primary's write path.
  {
    id: "primary-only-reads-without-throttle-overloads-primary",
    when: {
      triggerEquals: { writeSurgeActive: true },
      controlEquals: {
        [READ_ROUTING_KEY]: "primary-only",
        [WRITE_THROTTLE_LEVEL_KEY]: "none",
      },
    },
    incidentState: "primary-overloaded",
    values: {
      writeThroughputPerSec: 4_800,
      writeAcceptanceRate: 88,
      replicationLagMs: 36_000,
      replicaApplyRatePerSec: 1_200,
      staleReadAgeMs: 0,
      networkPressure: 55,
      storagePressure: 60,
      primaryStatus: "critical",
      replicationHealth: "backlogged",
    },
    componentHealth: primaryOverloadedHealth,
  },

  // ── Strategy (a), full: aggressive write throttling brings accepted
  // write volume back within what the replication stream can sustain.
  // Lag and stale-read age fall to normal and stay there — but the real,
  // modeled cost is write acceptance: throttled this hard, nearly half
  // of incoming write traffic is rejected or deferred.
  {
    id: "aggressive-throttle-recovers-replication",
    when: {
      triggerEquals: { writeSurgeActive: true },
      controlEquals: { [WRITE_THROTTLE_LEVEL_KEY]: "aggressive" },
    },
    incidentState: "throttled-recovered",
    values: {
      writeThroughputPerSec: 1_100,
      writeAcceptanceRate: 55,
      replicationLagMs: 180,
      replicaApplyRatePerSec: 1_150,
      staleReadAgeMs: 150,
      networkPressure: 25,
      storagePressure: 20,
      primaryStatus: "normal",
      replicationHealth: "throughput-matched",
    },
    componentHealth: healthyHealth,
  },

  // ── Strategy (c), full: parallelism + compressed batching raised
  // together, keeping writes unthrottled. Apply rate rises enough to
  // match write volume without sacrificing ingest throughput at all —
  // the best-case ceiling this strategy can reach, achievable only
  // because both levers (worker count AND batching) are pulled
  // together.
  {
    id: "parallelism-and-batching-recover-without-throttling",
    when: {
      triggerEquals: { writeSurgeActive: true },
      controlAtLeast: { [REPLICATION_WORKER_COUNT_KEY]: 16 },
      controlEquals: {
        [BATCHING_MODE_KEY]: "compressed-batch",
        [WRITE_THROTTLE_LEVEL_KEY]: "none",
      },
    },
    incidentState: "parallelism-recovered",
    values: {
      writeThroughputPerSec: 4_800,
      writeAcceptanceRate: 100,
      replicationLagMs: 220,
      replicaApplyRatePerSec: 4_750,
      staleReadAgeMs: 190,
      networkPressure: 60,
      storagePressure: 35,
      primaryStatus: "normal",
      replicationHealth: "throughput-matched",
    },
    componentHealth: healthyHealth,
  },

  // ── Strategy (c), capped partial: worker count raised with compressed
  // batching, but not far enough (8 workers) to fully close the gap
  // against this write volume. Lag improves substantially from
  // baseline but plateaus in a warning state — the real, modeled
  // ceiling on parallelism/batching alone: more workers help, but not
  // without bound.
  {
    id: "partial-parallelism-plateaus-below-full-recovery",
    when: {
      triggerEquals: { writeSurgeActive: true },
      controlAtLeast: { [REPLICATION_WORKER_COUNT_KEY]: 8 },
      controlEquals: {
        [BATCHING_MODE_KEY]: "compressed-batch",
        [WRITE_THROTTLE_LEVEL_KEY]: "none",
      },
    },
    incidentState: "parallelism-partial",
    values: {
      writeThroughputPerSec: 4_800,
      writeAcceptanceRate: 100,
      replicationLagMs: 6_500,
      replicaApplyRatePerSec: 3_600,
      staleReadAgeMs: 6_200,
      networkPressure: 70,
      storagePressure: 45,
      primaryStatus: "warning",
      replicationHealth: "backlogged",
    },
    componentHealth: degradedHealth,
  },

  // ── Strategy (b): primary-for-fresh-reads routing while writes stay
  // unthrottled. Reads that specifically need current data are routed
  // to the primary and see zero staleness; everything else still reads
  // from the lagging replica. Primary load rises moderately (only the
  // fresh-read subset, not all reads), and the backlog itself
  // (replicationLagMs) is left exactly where the baseline leaves it —
  // this protects a slice of read freshness without touching ingest
  // throughput or the replication pipeline at all.
  {
    id: "fresh-reads-routed-to-primary-isolates-staleness",
    when: {
      triggerEquals: { writeSurgeActive: true },
      controlEquals: {
        [READ_ROUTING_KEY]: "primary-for-fresh-reads",
        [WRITE_THROTTLE_LEVEL_KEY]: "none",
      },
    },
    incidentState: "reads-isolated",
    values: {
      writeThroughputPerSec: 4_800,
      writeAcceptanceRate: 100,
      replicationLagMs: 32_000,
      replicaApplyRatePerSec: 1_300,
      staleReadAgeMs: 0,
      networkPressure: 50,
      storagePressure: 55,
      primaryStatus: "warning",
      replicationHealth: "reads-isolated",
    },
    componentHealth: readsIsolatedHealth,
  },

  // ── Partial: moderate throttle alone, no parallelism/batching
  // change. Write acceptance cost is smaller than the aggressive tier,
  // but the backlog only shrinks part of the way — a real middle
  // ground on the consistency-vs-throughput axis.
  {
    id: "moderate-throttle-partial-relief",
    when: {
      triggerEquals: { writeSurgeActive: true },
      controlEquals: { [WRITE_THROTTLE_LEVEL_KEY]: "moderate" },
    },
    incidentState: "throttled-partial",
    values: {
      writeThroughputPerSec: 2_600,
      writeAcceptanceRate: 80,
      replicationLagMs: 4_200,
      replicaApplyRatePerSec: 2_500,
      staleReadAgeMs: 3_900,
      networkPressure: 40,
      storagePressure: 35,
      primaryStatus: "warning",
      replicationHealth: "backlogged",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial: deprioritizing non-critical write traffic sheds some
  // write volume without a blanket throttle, giving modest relief —
  // real but incomplete, since critical write traffic (the majority of
  // volume in this surge) is untouched.
  {
    id: "priority-shedding-partial-relief",
    when: {
      triggerEquals: { writeSurgeActive: true },
      controlEquals: {
        [TRAFFIC_PRIORITY_KEY]: "prioritize-critical-writes",
        [WRITE_THROTTLE_LEVEL_KEY]: "none",
      },
    },
    incidentState: "priority-shed-partial",
    values: {
      writeThroughputPerSec: 3_800,
      writeAcceptanceRate: 92,
      replicationLagMs: 14_000,
      replicaApplyRatePerSec: 1_900,
      staleReadAgeMs: 13_700,
      networkPressure: 60,
      storagePressure: 50,
      primaryStatus: "critical",
      replicationHealth: "backlogged",
    },
    componentHealth: criticalHealth,
  },

  // ── Second wave, baseline: sustained unmitigated backlog finally
  // exhausts staging storage for unapplied write-ahead segments. Only
  // reachable once no mitigation above has matched.
  {
    id: "storage-pressure-critical-baseline",
    when: { triggerEquals: { writeSurgeActive: true, storageNearCapacity: true } },
    incidentState: "storage-exhausted",
    values: {
      writeThroughputPerSec: 4_800,
      writeAcceptanceRate: 100,
      replicationLagMs: 95_000,
      replicaApplyRatePerSec: 900,
      staleReadAgeMs: 94_500,
      networkPressure: 92,
      storagePressure: 98,
      primaryStatus: "critical",
      replicationHealth: "backlogged",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: write surge active, no mitigating action
  // taken yet. Backlog is growing continuously.
  {
    id: "backlog-growing-baseline",
    when: { triggerEquals: { writeSurgeActive: true } },
    incidentState: "backlog-growing",
    values: {
      writeThroughputPerSec: 4_800,
      writeAcceptanceRate: 100,
      replicationLagMs: 18_000,
      replicaApplyRatePerSec: 1_300,
      staleReadAgeMs: 17_600,
      networkPressure: 65,
      storagePressure: 55,
      primaryStatus: "critical",
      replicationHealth: "backlogged",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      writeThroughputPerSec: 1_200,
      writeAcceptanceRate: 100,
      replicationLagMs: 400,
      replicaApplyRatePerSec: 1_200,
      staleReadAgeMs: 350,
      networkPressure: 20,
      storagePressure: 15,
      primaryStatus: "normal",
      replicationHealth: "throughput-matched",
    },
    componentHealth: healthyHealth,
  },
];
