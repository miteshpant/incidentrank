import type { ScenarioDefinition } from "./types";
import {
  splitBrainIncidentSimulation,
  FENCING_ACTION_KEY,
  QUORUM_REQUIREMENT_KEY,
  RECONCILIATION_POLICY_KEY,
  REGION_A_ACCESS_KEY,
  REGION_B_ACCESS_KEY,
} from "./split-brain-incident/definition";
import { splitBrainIncidentCandidateUI } from "./split-brain-incident/candidate-ui";
import { SPLIT_BRAIN_INCIDENT_SCORING } from "./split-brain-incident/scoring";

/**
 * Split-Brain Incident — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 37). A network
 * partition severs connectivity between Region A and Region B. Each
 * region's own local view of the cluster says nothing has changed about
 * its right to accept writes, so without a cross-region majority check
 * or explicit action, both sides can end up simultaneously believing
 * they hold write leadership — accepting writes independently, with no
 * way to know the other side is doing the same. Per-account writes must
 * never be accepted by more than one region at the same time: a
 * divergent or conflicting write that lands during the partition is
 * considered a critical data-integrity incident, regardless of how
 * healthy write availability looks in either region individually. The
 * candidate must restore a single, unambiguous write authority — and,
 * once connectivity returns, decide how any writes accepted during the
 * split get reconciled.
 */
export const splitBrainIncident: ScenarioDefinition = {
  id: "split-brain-incident",
  slug: "split-brain-incident",
  version: 1,
  name: "Split-Brain Incident",
  description:
    "A network partition has severed connectivity between Region A and Region B. Per-account writes must never be accepted by more than one region at the same time — a divergent or conflicting write landing during the partition is a critical data-integrity incident, regardless of how healthy write availability looks in either region individually. Restore a single, unambiguous write authority across the cluster, and decide how any writes accepted during the split should be reconciled once connectivity returns.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: splitBrainIncidentSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Split Brain", "Quorum", "Fencing", "Consistency", "Multi-Region"],
    skills: [
      "Recognizing when customer-facing availability conceals a correctness failure",
      "Distinguishing a structural quorum fix from a manually-achieved safe state",
      "Reasoning about fencing the correct side of a partition",
      "Deciding a reconciliation policy for divergent writes after connectivity returns",
    ],
    shortDescription:
      "Both regions may believe they hold write leadership during a network partition — and availability can look perfectly healthy on both sides while writes silently diverge.",
  },
};

export {
  splitBrainIncidentSimulation,
  splitBrainIncidentCandidateUI,
  SPLIT_BRAIN_INCIDENT_SCORING,
  FENCING_ACTION_KEY,
  QUORUM_REQUIREMENT_KEY,
  RECONCILIATION_POLICY_KEY,
  REGION_A_ACCESS_KEY,
  REGION_B_ACCESS_KEY,
};
