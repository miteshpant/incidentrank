import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CLIENT_RETRY_BEHAVIOR_KEY,
  ELECTION_TIMEOUT_MS_KEY,
  FLAKY_NODE_ISOLATED_KEY,
  HEARTBEAT_INTERVAL_MS_KEY,
  QUORUM_VOTING_SET_SIZE_KEY,
} from "./controls";

export const leaderElectionStormCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "leaderChangesPerMinute", label: "Leader Changes / Minute", sourceStateKey: "leaderChangesPerMinute", format: "number" },
    { key: "electionDurationMs", label: "Election Duration", sourceStateKey: "electionDurationMs", format: "duration" },
    { key: "requestFailureRate", label: "Request Failure Rate", sourceStateKey: "requestFailureRate", format: "percentage" },
    { key: "replicationLagMs", label: "Replication Lag", sourceStateKey: "replicationLagMs", format: "duration" },
    { key: "clusterThroughputRps", label: "Cluster Throughput", sourceStateKey: "clusterThroughputRps", format: "number" },
    { key: "node3HeartbeatMissStreak", label: "Node-3 Heartbeat Miss Streak", sourceStateKey: "node3HeartbeatMissStreak", format: "number" },
    { key: "quorumHealth", label: "Quorum Health", sourceStateKey: "quorumHealth", format: "status" },
  ],
  controls: [
    {
      key: ELECTION_TIMEOUT_MS_KEY,
      label: "Election Timeout",
      componentId: "coordination-layer",
    },
    {
      key: HEARTBEAT_INTERVAL_MS_KEY,
      label: "Heartbeat Interval",
      componentId: "coordination-layer",
    },
    {
      key: FLAKY_NODE_ISOLATED_KEY,
      label: "Isolate Node-3 From Voting",
      componentId: "node-3",
      valueLabels: { false: "In Voting Set", true: "Isolated" },
    },
    {
      key: QUORUM_VOTING_SET_SIZE_KEY,
      label: "Quorum Voting Set Size",
      componentId: "coordination-layer",
    },
    {
      key: CLIENT_RETRY_BEHAVIOR_KEY,
      label: "Client Retry Behavior",
      componentId: "clients",
      valueLabels: { aggressive: "Aggressive", backoff: "Backoff" },
    },
  ],
  components: [
    { id: "node-1", label: "Cluster Node 1" },
    { id: "node-2", label: "Cluster Node 2" },
    { id: "node-3", label: "Cluster Node 3" },
    { id: "coordination-layer", label: "Consensus / Coordination Layer" },
    { id: "clients", label: "Client Services" },
  ],
};
