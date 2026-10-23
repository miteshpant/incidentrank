import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  FENCING_ACTION_KEY,
  QUORUM_REQUIREMENT_KEY,
  RECONCILIATION_POLICY_KEY,
  REGION_A_ACCESS_KEY,
  REGION_B_ACCESS_KEY,
} from "./controls";

export const splitBrainIncidentCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "leaderCount", label: "Leader Count", sourceStateKey: "leaderCount", format: "number" },
    { key: "writeAuthorityState", label: "Write Authority", sourceStateKey: "writeAuthorityState", format: "status" },
    { key: "regionAWriteAvailability", label: "Region A Write Availability", sourceStateKey: "regionAWriteAvailability", format: "percentage" },
    { key: "regionBWriteAvailability", label: "Region B Write Availability", sourceStateKey: "regionBWriteAvailability", format: "percentage" },
    { key: "writesPerRegionA", label: "Writes/min (Region A)", sourceStateKey: "writesPerRegionA", format: "number" },
    { key: "writesPerRegionB", label: "Writes/min (Region B)", sourceStateKey: "writesPerRegionB", format: "number" },
    { key: "divergentWriteCount", label: "Divergent Writes", sourceStateKey: "divergentWriteCount", format: "number" },
    { key: "conflictCount", label: "Unresolved Conflicts", sourceStateKey: "conflictCount", format: "number" },
    { key: "unreconciledWriteCount", label: "Unreconciled Writes", sourceStateKey: "unreconciledWriteCount", format: "number" },
    { key: "partitionState", label: "Network Partition State", sourceStateKey: "partitionState", format: "status" },
    { key: "coordinatorStatus", label: "Coordinator Status", sourceStateKey: "coordinatorStatus", format: "status" },
  ],
  controls: [
    {
      key: QUORUM_REQUIREMENT_KEY,
      label: "Quorum Requirement",
      componentId: "coordinator",
      valueLabels: { "majority": "Require Majority", "any-single-region": "Any Single Region" },
    },
    {
      key: FENCING_ACTION_KEY,
      label: "Fencing Action",
      componentId: "coordinator",
      valueLabels: { "none": "None", "fence-region-a": "Fence Region A", "fence-region-b": "Fence Region B" },
    },
    {
      key: REGION_A_ACCESS_KEY,
      label: "Region A Access Mode",
      componentId: "region-a",
      valueLabels: { "read-write": "Read-Write", "read-only": "Read-Only", "offline": "Offline" },
    },
    {
      key: REGION_B_ACCESS_KEY,
      label: "Region B Access Mode",
      componentId: "region-b",
      valueLabels: { "read-write": "Read-Write", "read-only": "Read-Only", "offline": "Offline" },
    },
    {
      key: RECONCILIATION_POLICY_KEY,
      label: "Reconciliation Policy",
      componentId: "coordinator",
      valueLabels: {
        "defer-until-healed": "Defer Until Healed",
        "last-write-wins": "Last Write Wins",
        "manual-review": "Manual Review",
      },
    },
  ],
  components: [
    { id: "region-a", label: "Region A" },
    { id: "coordinator", label: "Distributed Coordinator" },
    { id: "region-b", label: "Region B" },
  ],
};
