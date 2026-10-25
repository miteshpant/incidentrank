import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  MEMBERSHIP_SIZE_KEY,
  NODE_D_MEMBERSHIP_KEY,
  NODE_E_MEMBERSHIP_KEY,
  QUORUM_REQUIREMENT_KEY,
  READ_ONLY_MODE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "node-a": "healthy",
  "node-b": "healthy",
  "node-c": "healthy",
  "node-d": "healthy",
  "node-e": "healthy",
  "consensus-group": "healthy",
};

const edgeHealth: Record<string, ComponentHealth> = {
  "node-a": "healthy",
  "node-b": "healthy",
  "node-c": "healthy",
  "node-d": "degraded",
  "node-e": "degraded",
  "consensus-group": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "node-a": "healthy",
  "node-b": "healthy",
  "node-c": "critical",
  "node-d": "degraded",
  "node-e": "degraded",
  "consensus-group": "critical",
};

const safeReadOnlyHealth: Record<string, ComponentHealth> = {
  "node-a": "healthy",
  "node-b": "healthy",
  "node-c": "critical",
  "node-d": "degraded",
  "node-e": "degraded",
  "consensus-group": "degraded",
};

const restoredThreeHealth: Record<string, ComponentHealth> = {
  "node-a": "healthy",
  "node-b": "healthy",
  "node-c": "healthy",
  "node-d": "degraded",
  "node-e": "degraded",
  "consensus-group": "healthy",
};

/**
 * Authored rule table for Quorum Loss, ordered most-specific first.
 *
 * A network issue isolates Node D and Node E (healthyNodeCount 5 -> 3),
 * landing the group exactly at the quorum edge for the original 5-node
 * membership (quorum requires 3). A second wave then takes Node C
 * unreachable too (healthyNodeCount -> 2), which genuinely drops the
 * group below quorum UNLESS the candidate has already restored real
 * quorum by reconfiguring the voting membership down to 3 nodes
 * (MEMBERSHIP_SIZE_KEY = "three", pairing with isolating D and E so the
 * remaining A/B/C membership has quorum = 2 and all 3 are reachable).
 *
 * Below quorum, two genuinely safe mechanisms exist, independent of each
 * other: explicitly engaging read-only mode (readOnlyMode = true), or
 * leaving quorumRequirement at the structural "strict-majority" setting
 * so the group refuses writes itself once it cannot verify a majority.
 * Both cost write availability but introduce zero correctness risk. The
 * trap is quorumRequirement = "relaxed-any-reachable" with readOnlyMode
 * left false: the leader keeps accepting writes from however many nodes
 * are reachable, with no real majority check -- writeAvailability reads
 * 100 the entire time, while unsafeWriteCount (the real, authored
 * correctness field) climbs. This state must never satisfy
 * successCondition or acceptableCondition, however healthy write
 * availability looks.
 */
export const quorumLossRules: Rule[] = [
  // ── Restored real quorum: membership reconfigured down to the 3 nodes
  // that are actually reachable (A, B, C), with D and E explicitly
  // isolated out of the voting set. Quorum for a 3-node membership is 2,
  // and all 3 remaining members are reachable -- genuine, comfortable
  // majority restored, independent of whatever has happened to Node C
  // (if Node C ALSO goes unreachable after this reconfiguration, A+B
  // alone is still 2 of 3, holding quorum). This wins over every
  // below-quorum rule below once membership has actually been
  // reconfigured.
  {
    id: "quorum-restored-three-node-membership",
    when: {
      triggerEquals: { nodesDEUnreachable: true },
      controlEquals: {
        [MEMBERSHIP_SIZE_KEY]: "three",
        [NODE_D_MEMBERSHIP_KEY]: "isolated",
        [NODE_E_MEMBERSHIP_KEY]: "isolated",
      },
    },
    incidentState: "quorum-restored-three-node",
    values: {
      healthyNodeCount: 3,
      quorumRequiredCount: 2,
      quorumStatus: "normal",
      leaderHealth: "healthy",
      writeAvailability: 100,
      replicationStatus: "current",
      nodeCHeartbeatHealth: "normal",
      unsafeWriteCount: 0,
      quorumSafetyMechanism: "membership-reconfigured",
    },
    componentHealth: restoredThreeHealth,
  },

  // ── Second wave reached (Node C unreachable too): genuinely below
  // quorum for the original 5-node membership (healthyNodeCount=2,
  // required=3).

  // UNSAFE TRAP: relaxed quorum requirement, read-only mode left off.
  // The leader keeps accepting writes from whichever 2 nodes are
  // reachable, with no real cross-node majority check. writeAvailability
  // reads 100 -- fully healthy from a customer-facing standpoint -- while
  // unsafeWriteCount climbs every tick. This must never satisfy
  // successCondition/acceptableCondition.
  {
    id: "below-quorum-unsafe-writes-accepted",
    when: {
      triggerEquals: { nodeCUnreachable: true },
      controlEquals: {
        [QUORUM_REQUIREMENT_KEY]: "relaxed-any-reachable",
        [READ_ONLY_MODE_KEY]: false,
      },
    },
    incidentState: "below-quorum-unsafe-writes",
    values: {
      healthyNodeCount: 2,
      quorumRequiredCount: 3,
      quorumStatus: "critical",
      leaderHealth: "degraded",
      writeAvailability: 100,
      replicationStatus: "diverging",
      nodeCHeartbeatHealth: "unreachable",
      unsafeWriteCount: 24,
      quorumSafetyMechanism: "unsafe-writes-accepted",
    },
    componentHealth: criticalHealth,
  },

  // SAFE DEGRADE: below quorum, but read-only mode is explicitly
  // engaged, or quorumRequirement is left at the structural
  // "strict-majority" setting (the leader refuses writes itself once it
  // cannot verify a majority, independent of readOnlyMode). Either way,
  // writes are genuinely refused -- reads continue from whichever nodes
  // remain reachable. Zero correctness risk, real availability cost.
  {
    id: "below-quorum-safe-read-only-explicit",
    when: {
      triggerEquals: { nodeCUnreachable: true },
      controlEquals: { [READ_ONLY_MODE_KEY]: true },
    },
    incidentState: "below-quorum-safe-read-only",
    values: {
      healthyNodeCount: 2,
      quorumRequiredCount: 3,
      quorumStatus: "critical",
      leaderHealth: "degraded",
      writeAvailability: 0,
      replicationStatus: "stalled",
      nodeCHeartbeatHealth: "unreachable",
      unsafeWriteCount: 0,
      quorumSafetyMechanism: "read-only-engaged",
    },
    componentHealth: safeReadOnlyHealth,
  },
  {
    id: "below-quorum-safe-structural-refusal",
    when: {
      triggerEquals: { nodeCUnreachable: true },
      controlEquals: {
        [QUORUM_REQUIREMENT_KEY]: "strict-majority",
        [READ_ONLY_MODE_KEY]: false,
      },
    },
    incidentState: "below-quorum-safe-structural-refusal",
    values: {
      healthyNodeCount: 2,
      quorumRequiredCount: 3,
      quorumStatus: "critical",
      leaderHealth: "degraded",
      writeAvailability: 0,
      replicationStatus: "stalled",
      nodeCHeartbeatHealth: "unreachable",
      unsafeWriteCount: 0,
      quorumSafetyMechanism: "structural-refusal",
    },
    componentHealth: safeReadOnlyHealth,
  },

  // ── Node C's heartbeat is visibly degrading (the observable precursor
  // to the second wave), quorum for the original 5-node membership still
  // holds at 3 of 5. Matches regardless of quorumRequirement/readOnlyMode
  // since quorum genuinely holds right now -- those controls only matter
  // once/if quorum is actually lost.
  {
    id: "node-c-warning-quorum-still-held",
    when: { triggerEquals: { nodeCWarning: true } },
    incidentState: "quorum-threatened-node-c-warning",
    values: {
      healthyNodeCount: 3,
      quorumRequiredCount: 3,
      quorumStatus: "warning",
      leaderHealth: "degraded",
      writeAvailability: 100,
      replicationStatus: "degraded",
      nodeCHeartbeatHealth: "degrading",
      unsafeWriteCount: 0,
      quorumSafetyMechanism: "unresolved",
    },
    componentHealth: edgeHealth,
  },

  // ── Quorum threatened (D and E unreachable, Node C's heartbeat still
  // normal): healthyNodeCount=3 of the original 5-node membership --
  // exactly at the quorum edge, zero margin, but genuinely still safe
  // right now. Falls through here once membership has NOT been
  // reconfigured down to three.
  {
    id: "quorum-threatened-at-edge",
    when: { triggerEquals: { nodesDEUnreachable: true } },
    incidentState: "quorum-threatened",
    values: {
      healthyNodeCount: 3,
      quorumRequiredCount: 3,
      quorumStatus: "warning",
      leaderHealth: "degraded",
      writeAvailability: 100,
      replicationStatus: "degraded",
      nodeCHeartbeatHealth: "normal",
      unsafeWriteCount: 0,
      quorumSafetyMechanism: "unresolved",
    },
    componentHealth: edgeHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      healthyNodeCount: 5,
      quorumRequiredCount: 3,
      quorumStatus: "normal",
      leaderHealth: "healthy",
      writeAvailability: 100,
      replicationStatus: "current",
      nodeCHeartbeatHealth: "normal",
      unsafeWriteCount: 0,
      quorumSafetyMechanism: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
