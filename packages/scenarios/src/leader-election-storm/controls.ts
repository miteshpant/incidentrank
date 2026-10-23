import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * The core tradeoff lever (phase6b.md section 38): raising the election
 * timeout gives the current leader more margin to survive a transient
 * network delay before followers decide it's dead and call a vote — but
 * the same margin is exactly how long the cluster stays leaderless (no
 * writes) if the leader genuinely does die. 150/300ms give almost no
 * margin above the observed jitter envelope (spikes up to ~900ms, see
 * timed-events.ts); 1200ms clears that envelope comfortably without
 * being excessive; 3000ms clears it too but has its own authored cost —
 * real failure detection (rules.ts's crash-path rules) takes
 * proportionally longer. There is no single "bigger is always better"
 * answer.
 */
export const ELECTION_TIMEOUT_MS_KEY = "electionTimeoutMs";

/** How often the leader sends heartbeats to followers. A heartbeat
 * interval too close to the election timeout leaves almost no room for
 * even a single delayed heartbeat before the timeout fires — the two
 * controls interact, raising the timeout alone is not sufficient if the
 * heartbeat cadence doesn't leave real margin between attempts. */
export const HEARTBEAT_INTERVAL_MS_KEY = "heartbeatIntervalMs";

/** Removes node-3 — the node whose link is experiencing the jitter —
 * from the voting set entirely. A valid, complementary path when the
 * jitter is isolated to one specific node: node-3's heartbeats (on time
 * or not) no longer matter to quorum/leadership at all. The real cost is
 * that the voting set shrinks to 2, so the cluster now tolerates zero
 * further voter loss before losing quorum entirely. */
export const FLAKY_NODE_ISOLATED_KEY = "flakyNodeIsolated";

/** Whether a standby voter is admitted to the voting set, raising fault
 * tolerance (one additional node can be lost without losing quorum) at
 * the cost of a slightly larger quorum-consensus message footprint on
 * every election. Independent of the jitter fix itself — widening the
 * set does not address node-3's link at all. */
export const QUORUM_VOTING_SET_SIZE_KEY = "quorumVotingSetSize";

/** How aggressively client services retry requests that fail while the
 * cluster is between leaders. Aggressive immediate retries multiply
 * request volume against a cluster that is already leaderless,
 * amplifying the throughput collapse during every election rather than
 * waiting it out. */
export const CLIENT_RETRY_BEHAVIOR_KEY = "clientRetryBehavior";

export const controls: ControlDefinition[] = [
  {
    key: ELECTION_TIMEOUT_MS_KEY,
    allowedValues: [150, 300, 600, 1200, 3000],
    initialValue: 150,
  },
  {
    key: HEARTBEAT_INTERVAL_MS_KEY,
    allowedValues: [50, 100, 200],
    initialValue: 50,
  },
  {
    key: FLAKY_NODE_ISOLATED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: QUORUM_VOTING_SET_SIZE_KEY,
    allowedValues: [3, 5],
    initialValue: 3,
  },
  {
    key: CLIENT_RETRY_BEHAVIOR_KEY,
    allowedValues: ["aggressive", "backoff"],
    initialValue: "aggressive",
  },
];
