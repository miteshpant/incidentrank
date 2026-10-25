import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  MEMBERSHIP_SIZE_KEY,
  NODE_D_MEMBERSHIP_KEY,
  NODE_E_MEMBERSHIP_KEY,
  QUORUM_REQUIREMENT_KEY,
  READ_ONLY_MODE_KEY,
  RECOVERY_PRIORITY_KEY,
} from "./controls";

export const quorumLossCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "healthyNodeCount", label: "Healthy/Reachable Nodes", sourceStateKey: "healthyNodeCount", format: "number" },
    { key: "quorumRequiredCount", label: "Quorum Required", sourceStateKey: "quorumRequiredCount", format: "number" },
    { key: "quorumStatus", label: "Quorum Status", sourceStateKey: "quorumStatus", format: "status" },
    { key: "leaderHealth", label: "Leader Health", sourceStateKey: "leaderHealth", format: "status" },
    { key: "writeAvailability", label: "Write Availability", sourceStateKey: "writeAvailability", format: "percentage" },
    { key: "replicationStatus", label: "Replication Status", sourceStateKey: "replicationStatus", format: "status" },
    { key: "nodeCHeartbeatHealth", label: "Node C Heartbeat", sourceStateKey: "nodeCHeartbeatHealth", format: "status" },
    { key: "unsafeWriteCount", label: "Unsafe Writes (Without Quorum)", sourceStateKey: "unsafeWriteCount", format: "number" },
  ],
  controls: [
    {
      key: QUORUM_REQUIREMENT_KEY,
      label: "Quorum Requirement",
      componentId: "consensus-group",
      valueLabels: { "strict-majority": "Require Strict Majority", "relaxed-any-reachable": "Relaxed (Any Reachable)" },
    },
    {
      key: NODE_D_MEMBERSHIP_KEY,
      label: "Node D Membership",
      componentId: "node-d",
      valueLabels: { voting: "Voting", isolated: "Isolated" },
    },
    {
      key: NODE_E_MEMBERSHIP_KEY,
      label: "Node E Membership",
      componentId: "node-e",
      valueLabels: { voting: "Voting", isolated: "Isolated" },
    },
    {
      key: READ_ONLY_MODE_KEY,
      label: "Read-Only Mode",
      componentId: "consensus-group",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: RECOVERY_PRIORITY_KEY,
      label: "Recovery Priority",
      componentId: "consensus-group",
      valueLabels: { "fast-rejoin": "Fast Rejoin", "safe-verify": "Safe Verify" },
    },
    {
      key: MEMBERSHIP_SIZE_KEY,
      label: "Voting Membership Size",
      componentId: "consensus-group",
      valueLabels: { five: "5 Nodes", three: "3 Nodes" },
    },
  ],
  components: [
    { id: "node-a", label: "Node A" },
    { id: "node-b", label: "Node B" },
    { id: "node-c", label: "Node C" },
    { id: "node-d", label: "Node D" },
    { id: "node-e", label: "Node E" },
    { id: "consensus-group", label: "Consensus Group" },
  ],
};
