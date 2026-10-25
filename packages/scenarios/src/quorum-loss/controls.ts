import type { ControlDefinition } from "@incidentrank/simulator";

/** How the consensus group decides whether it may safely accept writes.
 * "strict-majority" only accepts writes while the group can see a genuine
 * majority of its CURRENT voting membership (at least 3 of 5 nodes, or a
 * majority of whatever smaller membership is configured) — the safe,
 * correct behavior. "relaxed-any-reachable" is the dangerous legacy-
 * feeling setting: the leader accepts writes from however many nodes
 * happen to be reachable right now, with no real majority check at all —
 * this is what lets the group keep accepting writes even after it has
 * genuinely lost quorum. */
export const QUORUM_REQUIREMENT_KEY = "quorumRequirement";

/** Node D's membership status. "voting" keeps it in the voting set.
 * "isolated" explicitly excludes it from the voting membership — a
 * deliberate, candidate-initiated removal of a node the candidate has
 * judged to be unreliable, which shrinks the denominator quorum is
 * computed against rather than just leaving a half-reachable node
 * ambiguously counted. */
export const NODE_D_MEMBERSHIP_KEY = "nodeDMembership";

/** Node E's membership status — same semantics as NODE_D_MEMBERSHIP_KEY,
 * applied to Node E. */
export const NODE_E_MEMBERSHIP_KEY = "nodeEMembership";

/** Whether the consensus group refuses writes while it cannot verify a
 * genuine majority, while continuing to serve reads from whichever nodes
 * remain reachable. This is the safe degrade path: it costs write
 * availability but introduces zero correctness risk, independent of
 * whatever quorumRequirement is set to — read-only mode short-circuits
 * the write path entirely rather than relying on the leader's own quorum
 * check. */
export const READ_ONLY_MODE_KEY = "readOnlyMode";

/** How aggressively isolated/unreachable nodes are re-admitted to the
 * voting membership once they become reachable again. "fast-rejoin"
 * re-admits a returning node to voting immediately on reconnection, which
 * restores quorum sooner but risks counting a node whose log may still be
 * stale (it could have missed writes while it was gone) as a full voter
 * before it has caught up. "safe-verify" holds a returning node as a
 * non-voting learner until its log is confirmed caught up before counting
 * it toward quorum again — slower to restore real quorum, but never
 * counts a lagging node's vote. */
export const RECOVERY_PRIORITY_KEY = "recoveryPriority";

/** The voting membership size the quorum threshold is computed against.
 * "five" is the original 5-node group (quorum = 3). "three" is a
 * deliberate membership reconfiguration down to the 3 nodes the candidate
 * currently trusts most (quorum = 2) — this lowers the bar for regaining
 * quorum, but is itself a real membership change: reconfiguring away a
 * node that could have come back on its own trades future resilience for
 * an immediate quorum restoration. */
export const MEMBERSHIP_SIZE_KEY = "membershipSize";

export const controls: ControlDefinition[] = [
  {
    key: QUORUM_REQUIREMENT_KEY,
    allowedValues: ["strict-majority", "relaxed-any-reachable"],
    initialValue: "strict-majority",
  },
  {
    key: NODE_D_MEMBERSHIP_KEY,
    allowedValues: ["voting", "isolated"],
    initialValue: "voting",
  },
  {
    key: NODE_E_MEMBERSHIP_KEY,
    allowedValues: ["voting", "isolated"],
    initialValue: "voting",
  },
  {
    key: READ_ONLY_MODE_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: RECOVERY_PRIORITY_KEY,
    allowedValues: ["fast-rejoin", "safe-verify"],
    initialValue: "fast-rejoin",
  },
  {
    key: MEMBERSHIP_SIZE_KEY,
    allowedValues: ["five", "three"],
    initialValue: "five",
  },
];
