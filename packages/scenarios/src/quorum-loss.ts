import type { ScenarioDefinition } from "./types";
import {
  quorumLossSimulation,
  MEMBERSHIP_SIZE_KEY,
  NODE_D_MEMBERSHIP_KEY,
  NODE_E_MEMBERSHIP_KEY,
  QUORUM_REQUIREMENT_KEY,
  READ_ONLY_MODE_KEY,
  RECOVERY_PRIORITY_KEY,
} from "./quorum-loss/definition";
import { quorumLossCandidateUI } from "./quorum-loss/candidate-ui";
import { QUORUM_LOSS_SCORING } from "./quorum-loss/scoring";

/**
 * Quorum Loss — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 54). A 5-node consensus
 * group backs a system where writes must only ever be accepted once a
 * genuine majority of the voting membership agrees — never on the say of
 * a leader that merely believes it is reachable by enough nodes to act
 * alone. A network issue isolates two of the five nodes, leaving the
 * group at the exact edge of quorum with no margin left. If a third node
 * also becomes unreachable, the group genuinely falls below the number
 * of nodes required for a safe majority. Continuing to accept writes in
 * that state is a correctness violation regardless of how healthy write
 * availability looks on the surface — the only genuinely safe choices
 * are restoring real quorum (by recovering nodes or reconfiguring the
 * voting membership to match what is actually reachable) or correctly
 * refusing writes while below quorum. The candidate must decide which of
 * these is appropriate, and recognize why continuing to accept writes
 * without a majority is never an acceptable shortcut, however normal the
 * dashboards look.
 */
export const quorumLoss: ScenarioDefinition = {
  id: "quorum-loss",
  slug: "quorum-loss",
  version: 1,
  name: "Quorum Loss",
  description:
    "A 5-node consensus group requires a genuine majority of its voting membership to agree before any write is considered safely committed. A network issue has isolated two of the five nodes, leaving the group at the exact edge of quorum with zero margin to lose another. If a third node also becomes unreachable, the group will genuinely fall below the number of nodes needed for a safe majority — and continuing to accept writes in that state is a correctness violation, not a capacity problem, regardless of how healthy write availability looks. Decide how to respond to a group under real threat of losing safe quorum, and what the right behavior is if that threshold is actually crossed.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  simulation: quorumLossSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Consensus", "Quorum", "Node Availability", "Membership", "Correctness"],
    skills: [
      "Distinguishing a quorum genuinely threatened from one genuinely lost",
      "Recognizing when customer-facing availability conceals an unsafe write",
      "Reasoning about voting membership reconfiguration versus waiting for node recovery",
      "Choosing a safe degrade (read-only) over an unsafe shortcut under node loss",
    ],
    shortDescription:
      "A 5-node consensus group edges toward — and may cross — the threshold for safe quorum, and write availability can look perfectly healthy while writes are being accepted without a real majority.",
  },
};

export {
  quorumLossSimulation,
  quorumLossCandidateUI,
  QUORUM_LOSS_SCORING,
  MEMBERSHIP_SIZE_KEY,
  NODE_D_MEMBERSHIP_KEY,
  NODE_E_MEMBERSHIP_KEY,
  QUORUM_REQUIREMENT_KEY,
  READ_ONLY_MODE_KEY,
  RECOVERY_PRIORITY_KEY,
};
