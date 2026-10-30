import type { ScenarioDefinition } from "./types";
import {
  leaderElectionStormSimulation,
  CLIENT_RETRY_BEHAVIOR_KEY,
  ELECTION_TIMEOUT_MS_KEY,
  FLAKY_NODE_ISOLATED_KEY,
  HEARTBEAT_INTERVAL_MS_KEY,
  QUORUM_VOTING_SET_SIZE_KEY,
} from "./leader-election-storm/definition";
import { leaderElectionStormCandidateUI } from "./leader-election-storm/candidate-ui";
import { LEADER_ELECTION_STORM_SCORING } from "./leader-election-storm/scoring";

/**
 * Leader Election Storm — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 38). One node's network
 * link develops intermittent latency, delaying its heartbeats past
 * whatever election timeout is configured — even though the node itself
 * never actually fails. The cluster keeps re-electing a leader anyway,
 * and every election is a window where writes and strong reads fail.
 * The candidate must reason about a genuine tradeoff rather than find
 * one magic number: a short timeout detects a real leader failure fast
 * but also mistakes transient jitter for death, while an excessively
 * long timeout survives the jitter but makes any later genuine failure
 * far slower to detect and recover from. Isolating the specific flaky
 * node from the voting set is a valid, complementary path when the
 * jitter is isolated to one node — at the cost of the cluster's
 * remaining fault-tolerance margin.
 */
export const leaderElectionStorm: ScenarioDefinition = {
  id: "leader-election-storm",
  slug: "leader-election-storm",
  version: 1,
  name: "Leader Election Storm",
  description:
    "A production consensus cluster backs a service where writes and strong reads must go through a single leader at any given moment. One node's network link has started experiencing intermittent latency — the node itself is healthy, but its heartbeats are sporadically arriving late. The cluster is holding repeated, disruptive leadership elections, and every election is a window where writes and strong reads fail. The remaining fault-tolerance margin of the voting set matters for whatever you do next — the cluster must stay able to tolerate losing a node, not just look quiet right now. Diagnose why the cluster keeps re-electing a leader and bring it to a state that is durably stable, not merely quiet at this exact moment.",
  difficulty: "staff",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: leaderElectionStormSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Consensus", "Leader Election", "Quorum", "Raft", "Network Jitter"],
    skills: [
      "Reasoning about failure-detection speed vs. stability under transient latency",
      "Distinguishing a proportionate timeout fix from an oversized one",
      "Evaluating node isolation as a complementary mitigation, not a universal fix",
      "Recognizing when a quiet cluster's stability is unproven rather than earned",
    ],
    shortDescription:
      "Intermittent network latency on one node is triggering repeated, disruptive leader elections — and the obvious 'raise the timeout' fix has its own real cost.",
  },
};

export {
  leaderElectionStormSimulation,
  leaderElectionStormCandidateUI,
  LEADER_ELECTION_STORM_SCORING,
  CLIENT_RETRY_BEHAVIOR_KEY,
  ELECTION_TIMEOUT_MS_KEY,
  FLAKY_NODE_ISOLATED_KEY,
  HEARTBEAT_INTERVAL_MS_KEY,
  QUORUM_VOTING_SET_SIZE_KEY,
};
