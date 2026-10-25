import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  MEMBERSHIP_SIZE_KEY,
  NODE_D_MEMBERSHIP_KEY,
  NODE_E_MEMBERSHIP_KEY,
  QUORUM_REQUIREMENT_KEY,
  READ_ONLY_MODE_KEY,
  RECOVERY_PRIORITY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: QUORUM_REQUIREMENT_KEY,
    valueEquals: "relaxed-any-reachable",
    whenTriggerEquals: { nodeCUnreachable: true },
    outcome: "harmful",
    feedback: {
      title: "Let the group accept writes without a real majority",
      explanation:
        "Leaving quorum at relaxed-any-reachable means the leader accepts writes from however many nodes happen to be reachable, with no genuine cross-node majority check. Once the group dropped below quorum, this is exactly what let writes keep landing that were never actually agreed to by a majority of the voting membership — and because write availability still reads 100%, nothing in the customer-facing dashboard signals that anything is wrong.",
    },
  },
  {
    id: "acr_2",
    controlKey: QUORUM_REQUIREMENT_KEY,
    valueEquals: "strict-majority",
    whenTriggerEquals: { nodeCUnreachable: true },
    outcome: "beneficial",
    feedback: {
      title: "Required a genuine majority before accepting writes",
      explanation:
        "Strict-majority quorum means the group refuses to accept a write unless it can verify agreement from a real majority of its voting membership. Once the group dropped below quorum, this setting alone made the leader stop accepting new writes on its own — a real, visible availability cost, but zero correctness risk, without needing a separate manual read-only switch.",
    },
  },
  {
    id: "acr_3",
    controlKey: READ_ONLY_MODE_KEY,
    valueEquals: true,
    whenTriggerEquals: { nodeCUnreachable: true },
    outcome: "beneficial",
    feedback: {
      title: "Explicitly switched to read-only below quorum",
      explanation:
        "Engaging read-only mode explicitly refuses all writes while the group cannot verify a majority, independent of whatever the leader's own quorum logic would otherwise decide. Reads kept serving from whichever nodes remained reachable. This is a deliberate, visible tradeoff — write availability for correctness — rather than waiting on the group's own internal quorum check to catch the problem.",
    },
  },
  {
    id: "acr_4",
    controlKey: NODE_D_MEMBERSHIP_KEY,
    valueEquals: "isolated",
    whenTriggerEquals: { nodesDEUnreachable: true },
    outcome: "beneficial",
    feedback: {
      title: "Excluded an unreachable node from the voting set",
      explanation:
        "Isolating Node D removes it from the voting membership rather than leaving it ambiguously counted as a voter that happens to be unreachable. Combined with reconfiguring membership size and isolating Node E, this shrinks the quorum denominator down to the nodes that are actually reachable — but on its own, without a matching membership-size change, it does not yet restore quorum math by itself.",
    },
  },
  {
    id: "acr_4b",
    controlKey: NODE_E_MEMBERSHIP_KEY,
    valueEquals: "isolated",
    whenTriggerEquals: { nodesDEUnreachable: true },
    outcome: "beneficial",
    feedback: {
      title: "Excluded the second unreachable node from the voting set",
      explanation:
        "Isolating Node E, alongside Node D, removes both unreachable nodes from the voting membership rather than leaving them ambiguously counted as voters that happen to be unreachable. Combined with reconfiguring membership size down to three, this restores a genuine, comfortable majority among the nodes that are actually reachable — but on its own, without the matching membership-size change, it does not yet restore quorum math by itself.",
    },
  },
  {
    id: "acr_5",
    controlKey: MEMBERSHIP_SIZE_KEY,
    valueEquals: "three",
    whenTriggerEquals: { nodesDEUnreachable: true },
    outcome: "beneficial",
    feedback: {
      title: "Reconfigured voting membership down to the reachable nodes",
      explanation:
        "Shrinking the voting membership to the three nodes that are actually reachable lowers the quorum bar to match reality, restoring a genuine, comfortable majority instead of waiting on Node D and Node E to come back. The tradeoff is real: this is a structural membership change, and it trades away D and E's future voting weight (they would need to be formally re-admitted later) for an immediate, durable quorum restoration right now.",
    },
  },
  {
    id: "acr_6",
    controlKey: RECOVERY_PRIORITY_KEY,
    valueEquals: "fast-rejoin",
    whenTriggerEquals: { nodesDEUnreachable: true },
    outcome: "neutral",
    feedback: {
      title: "Prioritized restoring quorum quickly over verifying state",
      explanation:
        "Fast-rejoin re-admits a returning node to the voting membership as soon as it reconnects, restoring quorum sooner. The tradeoff is that a node which was gone for a while may have missed writes while it was unreachable — counting its vote immediately, before confirming it has caught up, risks counting a stale replica's agreement as if it were current.",
    },
  },
  {
    id: "acr_7",
    controlKey: RECOVERY_PRIORITY_KEY,
    valueEquals: "safe-verify",
    whenTriggerEquals: { nodesDEUnreachable: true },
    outcome: "neutral",
    feedback: {
      title: "Prioritized verifying state before restoring a vote",
      explanation:
        "Safe-verify holds a returning node as a non-voting learner until its log is confirmed caught up before counting it toward quorum again. This never counts a lagging node's vote, but it means quorum takes longer to restore through node recovery alone compared to re-admitting nodes immediately on reconnection.",
    },
  },
];
