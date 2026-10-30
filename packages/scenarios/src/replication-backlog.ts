import type { ScenarioDefinition } from "./types";
import {
  replicationBacklogSimulation,
  WRITE_THROTTLE_LEVEL_KEY,
  REPLICATION_WORKER_COUNT_KEY,
  BATCHING_MODE_KEY,
  READ_ROUTING_KEY,
  TRAFFIC_PRIORITY_KEY,
  REPLICA_COUNT_KEY,
} from "./replication-backlog/definition";
import { replicationBacklogCandidateUI } from "./replication-backlog/candidate-ui";
import { REPLICATION_BACKLOG_SCORING } from "./replication-backlog/scoring";

/**
 * Replication Backlog — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 55). Write volume to
 * the primary has risen above what the replication stream can apply,
 * and the backlog grows continuously for as long as it goes
 * unaddressed — not a one-time spike that will settle on its own. The
 * candidate must choose what to protect: throttle writes at the primary
 * to bring accepted volume back within sustainable replication capacity
 * (trading ingest throughput for freshness), route freshness-sensitive
 * reads to the primary (protecting readers without touching the
 * backlog itself), or raise replication worker parallelism and use
 * compressed batching to scale apply capacity to match ingest — each
 * with a real, modeled cost or ceiling.
 */
export const replicationBacklog: ScenarioDefinition = {
  id: "replication-backlog",
  slug: "replication-backlog",
  version: 1,
  name: "Replication Backlog",
  description:
    "Write volume to your primary database has risen sharply and keeps climbing. The replication stream feeding your replica fleet cannot apply writes as fast as they are arriving, and the backlog is growing continuously rather than settling back down on its own. Downstream reporting and read-heavy services depend on the replica fleet and can tolerate some staleness, but a subset of read traffic requires genuinely current data. Write throughput also matters: the primary serves real-time write-heavy workloads that customers are actively waiting on. Bring replication back to a durable, sustainable state without silently sacrificing whichever of consistency, read latency, or ingest throughput the business actually needs most.",
  difficulty: "staff",
  estimatedMinutes: 18,
  isFree: false,
  structure: "linear",
  simulation: replicationBacklogSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Replication", "Consistency", "Throughput", "Capacity Planning", "Backpressure"],
    skills: [
      "Diagnosing a sustained ingest-vs-apply-rate mismatch",
      "Reasoning about consistency, read latency, and throughput as a three-way tradeoff",
      "Recognizing when a mitigation isolates a symptom instead of clearing the backlog",
      "Evaluating replication parallelism/batching against a real modeled capacity ceiling",
    ],
    shortDescription:
      "Write volume keeps outrunning replication throughput, and the backlog keeps growing — protecting consistency, read latency, and ingest throughput all pull in different directions.",
  },
};

export {
  replicationBacklogSimulation,
  replicationBacklogCandidateUI,
  REPLICATION_BACKLOG_SCORING,
  WRITE_THROTTLE_LEVEL_KEY,
  REPLICATION_WORKER_COUNT_KEY,
  BATCHING_MODE_KEY,
  READ_ROUTING_KEY,
  TRAFFIC_PRIORITY_KEY,
  REPLICA_COUNT_KEY,
};
