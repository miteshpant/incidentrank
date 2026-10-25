import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BATCHING_MODE_KEY,
  READ_ROUTING_KEY,
  REPLICA_COUNT_KEY,
  REPLICATION_WORKER_COUNT_KEY,
  TRAFFIC_PRIORITY_KEY,
  WRITE_THROTTLE_LEVEL_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per phase6c.md section 14. Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: WRITE_THROTTLE_LEVEL_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { writeSurgeActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Protected replication freshness by throttling writes",
      explanation:
        "Bringing accepted write volume down below the replication stream's sustainable apply rate let the backlog drain and stay drained — lag and stale-read age both returned to normal. The direct cost was ingest throughput: throttled this hard, a large share of incoming write traffic was rejected or deferred rather than accepted immediately.",
    },
  },
  {
    id: "acr_2",
    controlKey: WRITE_THROTTLE_LEVEL_KEY,
    valueEquals: "moderate",
    whenTriggerEquals: { writeSurgeActive: true },
    outcome: "neutral",
    feedback: {
      title: "Partial throttle, partial relief",
      explanation:
        "A moderate throttle reduced accepted write volume enough to shrink the backlog somewhat, but not enough to bring replication fully back within sustainable capacity. Lag and staleness improved from baseline without fully clearing — a real middle ground on the consistency-vs-throughput tradeoff, not a complete fix.",
    },
  },
  {
    id: "acr_3",
    controlKey: REPLICATION_WORKER_COUNT_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { writeSurgeActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Scaled replication apply capacity to match ingest",
      explanation:
        "Raising replication worker parallelism (combined with compressed batching) let the replica fleet apply writes fast enough to match incoming write volume without throttling anything at the primary. This protected full ingest throughput — but it only worked because parallelism was raised far enough and paired with compression; a smaller increase alone would have plateaued below full recovery.",
    },
  },
  {
    id: "acr_4",
    controlKey: REPLICATION_WORKER_COUNT_KEY,
    valueEquals: 8,
    whenTriggerEquals: { writeSurgeActive: true },
    outcome: "neutral",
    feedback: {
      title: "More apply workers helped, but hit a real ceiling",
      explanation:
        "Increasing replication parallelism raised the replica's apply rate substantially, but write volume in this surge still exceeded what that many workers could sustain. Lag and staleness improved a lot from baseline but plateaued in a degraded state rather than fully recovering — parallelism alone has a real, modeled limit against write volume this high.",
    },
  },
  {
    id: "acr_5",
    controlKey: BATCHING_MODE_KEY,
    valueEquals: "large-uncompressed-batch",
    whenTriggerEquals: { writeSurgeActive: true },
    outcome: "harmful",
    feedback: {
      title: "Bigger batches without compression backfired",
      explanation:
        "Shipping larger uncompressed batches down the replication stream to 'catch up faster' multiplied the network bytes moved per applied write. Network pressure spiked and lag got worse than doing nothing at all — the attempt to raise throughput actually shrank it.",
    },
  },
  {
    id: "acr_6",
    controlKey: READ_ROUTING_KEY,
    valueEquals: "primary-for-fresh-reads",
    whenTriggerEquals: { writeSurgeActive: true },
    outcome: "neutral",
    feedback: {
      title: "Solved staleness for readers, not the backlog itself",
      explanation:
        "Routing freshness-sensitive reads to the primary eliminated stale reads for that traffic immediately, at a moderate primary-load cost. But replication lag itself kept growing exactly as it would have otherwise — this protects what readers see without addressing the underlying ingest-vs-apply-rate mismatch, so the backlog remains an open, unbounded risk.",
    },
  },
  {
    id: "acr_7",
    controlKey: READ_ROUTING_KEY,
    valueEquals: "primary-only",
    whenTriggerEquals: { writeSurgeActive: true },
    outcome: "harmful",
    feedback: {
      title: "Routed every read onto an already-strained primary",
      explanation:
        "Sending all read traffic to the primary while it was still absorbing the full, unthrottled write surge meant the primary now had to serve every write AND every read at once. Read freshness was protected, but primary latency and load both rose sharply — the primary itself became the new bottleneck.",
    },
  },
  {
    id: "acr_8",
    controlKey: REPLICA_COUNT_KEY,
    valueAtLeast: 2,
    whenTriggerEquals: { writeSurgeActive: true },
    outcome: "harmful",
    feedback: {
      title: "Added a consumer to an already-constrained pipeline",
      explanation:
        "Each additional replica is another consumer of the primary's replication fan-out bandwidth. Adding replicas while already backlogged increased contention on that already-constrained path rather than relieving it — replica count helps spread read load once the pipeline is healthy, but it cannot fix a backlog by itself.",
    },
  },
  {
    id: "acr_9",
    controlKey: TRAFFIC_PRIORITY_KEY,
    valueEquals: "prioritize-critical-writes",
    whenTriggerEquals: { writeSurgeActive: true },
    outcome: "neutral",
    feedback: {
      title: "Shed some load, not enough to clear the backlog",
      explanation:
        "Deprioritizing non-critical writes reduced total write volume somewhat and gave modest relief, but critical write traffic — the majority of this surge — was untouched, so the backlog continued growing, just more slowly.",
    },
  },
];
