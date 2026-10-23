import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CLIENT_RETRY_BEHAVIOR_KEY,
  ELECTION_TIMEOUT_MS_KEY,
  FLAKY_NODE_ISOLATED_KEY,
  HEARTBEAT_INTERVAL_MS_KEY,
  QUORUM_VOTING_SET_SIZE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "node-1": "healthy",
  "node-2": "healthy",
  "node-3": "healthy",
  "coordination-layer": "healthy",
  clients: "healthy",
};

// node-3 isolated from voting: it no longer participates in leadership
// at all, so it is shown degraded (demoted) rather than healthy, while
// the rest of the cluster stays healthy.
const isolatedHealth: Record<string, ComponentHealth> = {
  "node-1": "healthy",
  "node-2": "healthy",
  "node-3": "degraded",
  "coordination-layer": "healthy",
  clients: "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "node-1": "degraded",
  "node-2": "degraded",
  "node-3": "degraded",
  "coordination-layer": "degraded",
  clients: "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "node-1": "critical",
  "node-2": "critical",
  "node-3": "critical",
  "coordination-layer": "critical",
  clients: "critical",
};

// Mid-failover right after the genuine crash: node-3 is actually down,
// the rest of the cluster is working through a real leader election.
const failoverHealth: Record<string, ComponentHealth> = {
  "node-1": "degraded",
  "node-2": "degraded",
  "node-3": "critical",
  "coordination-layer": "degraded",
  clients: "degraded",
};

// Settled after a real failover completes: node-3 is gone for good, the
// remaining two nodes have re-stabilized under whichever leader won.
const settledAfterCrashHealth: Record<string, ComponentHealth> = {
  "node-1": "healthy",
  "node-2": "healthy",
  "node-3": "critical",
  "coordination-layer": "healthy",
  clients: "healthy",
};

/**
 * Authored rule table for Leader Election Storm, ordered most-specific
 * first.
 *
 * Node-3's network link develops intermittent latency (spikes up to
 * ~900ms) while node-3 itself stays alive. Whether this produces
 * disruptive, repeated leadership changes depends entirely on whether
 * electionTimeoutMs clears that jitter envelope with real margin:
 *
 *   - 150/300ms: nowhere close to the ~900ms jitter envelope — every
 *     jitter spike is misread as leader death. Severe, continuous
 *     spurious re-elections.
 *   - 600ms: still below the jitter envelope — spurious elections
 *     continue, somewhat less often.
 *   - 1200ms: clears the jitter envelope with real margin. Combined
 *     with a heartbeat interval that leaves multiple attempts inside
 *     that window (<=100ms — at least ~12 tries before timeout), this
 *     is the generalizable "enough margin, not maximal" fix: stable
 *     under the jitter, and (see the crash-path rules below) still
 *     detects a genuine failure in just over a second.
 *   - 1200ms with a 200ms heartbeat interval: still clears the jitter
 *     envelope on average, but with far fewer heartbeat attempts inside
 *     the window, a single additional delayed heartbeat occasionally
 *     still trips the timeout — residual, low-rate instability. The two
 *     controls interact; raising the timeout alone is not always
 *     sufficient at the boundary.
 *   - 3000ms: also clears the jitter envelope (regardless of heartbeat
 *     interval) and looks identically stable DURING the jitter-only
 *     window — but this is the "excessively long" trap: see the
 *     crash-path rules for its real, authored cost once node-3
 *     genuinely fails.
 *
 * Isolating node-3 (flakyNodeIsolated) removes it from the voting set
 * entirely, which is unconditionally stable against its jitter — a
 * valid complementary/alternate path specifically because the jitter is
 * isolated to one identifiable node — but it shrinks the voting set to
 * 2, leaving zero remaining fault tolerance (losing either remaining
 * voter loses quorum outright, visible via quorumHealth).
 *
 * clientRetryBehavior="aggressive" amplifies throughput collapse during
 * any already-unstable (spurious-election) state by multiplying request
 * volume against a cluster that keeps going leaderless; it never causes
 * instability on its own. quorumVotingSetSize=5 (an added standby voter)
 * does not address node-3's link at all and adds a small amount of
 * consensus overhead to every election, making spurious elections
 * slightly worse, not better, while jitter is unaddressed.
 */
export const leaderElectionStormRules: Rule[] = [
  // ════════════════════════════════════════════════════════════════
  // Crash-phase rules (node3Crashed = true) — checked first since
  // node3Crashed only ever accompanies networkJitterNode3 = true.
  // ════════════════════════════════════════════════════════════════

  // ── OPTIMAL (isolation path, crash): node-3 was already excluded
  // from voting before it crashed, so its crash changes nothing about
  // leadership — there is no election to run at all. The cost (zero
  // remaining fault tolerance) is real but did not bite this time.
  {
    id: "isolated-unaffected-by-crash",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Crashed: true },
      controlEquals: { [FLAKY_NODE_ISOLATED_KEY]: true },
    },
    incidentState: "isolated-unaffected-by-crash",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 20,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 0,
      failureDetectionTimeMs: 0,
      quorumHealth: "no-slack",
      electionStabilityMechanism: "node-isolated",
    },
    componentHealth: settledAfterCrashHealth,
  },

  // ── Settled recovery after a margin-fixed failover — checked before
  // the mid-failover rule below since crashSettled is a strict
  // superset of this phase's triggers and must be matched first.
  {
    id: "margin-fixed-settled",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Crashed: true, crashSettled: true },
      controlEquals: { [ELECTION_TIMEOUT_MS_KEY]: 1_200 },
      controlAtMost: { [HEARTBEAT_INTERVAL_MS_KEY]: 100 },
    },
    incidentState: "margin-fixed-settled",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 25,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 0,
      failureDetectionTimeMs: 1_350,
      quorumHealth: "no-slack",
      electionStabilityMechanism: "margin-fixed",
    },
    componentHealth: settledAfterCrashHealth,
  },

  // ── OPTIMAL (margin-fixed path, crash, mid-failover): the leader was
  // node-3 or a timeout is in flight — electionTimeoutMs=1200 with a
  // heartbeat interval that leaves real margin (<=100ms) detects the
  // genuine failure in just over a second. This is the brief,
  // immediately-after-the-crash window before the new leader settles.
  {
    id: "margin-fixed-failing-over",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Crashed: true },
      controlEquals: { [ELECTION_TIMEOUT_MS_KEY]: 1_200 },
      controlAtMost: { [HEARTBEAT_INTERVAL_MS_KEY]: 100 },
    },
    incidentState: "margin-fixed-failing-over",
    values: {
      leaderChangesPerMinute: 1,
      electionDurationMs: 1_350,
      requestFailureRate: 8,
      replicationLagMs: 90,
      clusterThroughputRps: 760,
      node3HeartbeatMissStreak: 0,
      failureDetectionTimeMs: 1_350,
      quorumHealth: "degraded",
      electionStabilityMechanism: "margin-fixed",
    },
    componentHealth: failoverHealth,
  },

  // ── Settled recovery after an excessive-timeout failover (reachable
  // once enough time has passed for the single failover to complete —
  // the long timeout is a one-time tax, not a permanently broken
  // state). Metrics look healthy again, but only after paying the long
  // detection-time cost once; this state is reached well after the
  // crash, never immediately. Checked before the mid-failover rule
  // below since crashSettled is a strict superset of this phase's
  // triggers and must be matched first.
  {
    id: "excessive-timeout-settled",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Crashed: true, crashSettled: true },
      controlAtLeast: { [ELECTION_TIMEOUT_MS_KEY]: 3_000 },
    },
    incidentState: "excessive-timeout-settled",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 25,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 0,
      failureDetectionTimeMs: 3_400,
      quorumHealth: "no-slack",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: settledAfterCrashHealth,
  },

  // ── UNSAFE trap, crash, mid-failover: electionTimeoutMs=3000 also
  // looked perfectly stable during jitter-only, but now that node-3 has
  // genuinely died, the cluster cannot detect it and fail over until
  // the full ~3000ms timeout elapses — repeatedly, until a stable
  // leader is re-established. Writes are unavailable for a much longer
  // stretch than the margin-fixed path above. This is the authored,
  // observable cost of "bigger is always better" timeout thinking.
  {
    id: "excessive-timeout-slow-failover",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Crashed: true },
      controlAtLeast: { [ELECTION_TIMEOUT_MS_KEY]: 3_000 },
    },
    incidentState: "excessive-timeout-slow-failover",
    values: {
      leaderChangesPerMinute: 2,
      electionDurationMs: 3_400,
      requestFailureRate: 46,
      replicationLagMs: 340,
      clusterThroughputRps: 310,
      node3HeartbeatMissStreak: 0,
      failureDetectionTimeMs: 3_400,
      quorumHealth: "degraded",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── UNSAFE, crash, compounding failure: the cluster was already
  // flapping on spurious elections (timeout too short for the jitter
  // envelope) before node-3 genuinely died — the real failure lands on
  // top of an already-unstable cluster, the worst compounding case.
  // This state never settles into anything safer on its own (the
  // underlying timeout/jitter mismatch is permanent, not one-time), so
  // it correctly has no corresponding "-settled" rule.
  {
    id: "spurious-elections-plus-real-crash",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Crashed: true },
      controlAtMost: { [ELECTION_TIMEOUT_MS_KEY]: 600 },
    },
    incidentState: "spurious-elections-plus-real-crash",
    values: {
      leaderChangesPerMinute: 34,
      electionDurationMs: 540,
      requestFailureRate: 78,
      replicationLagMs: 520,
      clusterThroughputRps: 90,
      node3HeartbeatMissStreak: 40,
      failureDetectionTimeMs: 540,
      quorumHealth: "critical",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ════════════════════════════════════════════════════════════════
  // Degrading-precursor rules (node3Degrading = true, no crash yet) —
  // checked before the plain jitter-only rules below since
  // node3Degrading is a strict superset of networkJitterNode3 and must
  // be matched first. node3HeartbeatMissStreak climbs further here
  // than in the matching plain-jitter state, in EVERY control
  // combination, independent of whether the candidate's chosen
  // mitigation otherwise keeps the cluster quiet — the honest,
  // observable warning (section 7) that node-3 specifically is
  // trending toward a real failure, not just experiencing ordinary
  // transient blips.
  // ════════════════════════════════════════════════════════════════

  // ── Isolated path, degrading precursor: still fully stable (node-3
  // isn't a voter), but its rising miss streak is visible for anyone
  // watching node-3 itself, not just the cluster's voting health.
  {
    id: "isolated-stable-node3-degrading",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Degrading: true },
      controlEquals: { [FLAKY_NODE_ISOLATED_KEY]: true },
    },
    incidentState: "isolated-stable-degrading",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 20,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 30,
      failureDetectionTimeMs: 0,
      quorumHealth: "no-slack",
      electionStabilityMechanism: "node-isolated",
    },
    componentHealth: isolatedHealth,
  },

  // ── Margin-fixed path, degrading precursor: still fully stable
  // (1200ms clears even a worsening jitter envelope), but the rising
  // miss streak is the fair-warning signal that node-3 is trending
  // toward something worse than transient jitter.
  {
    id: "margin-fixed-stable-node3-degrading",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Degrading: true },
      controlEquals: { [ELECTION_TIMEOUT_MS_KEY]: 1_200 },
      controlAtMost: { [HEARTBEAT_INTERVAL_MS_KEY]: 100 },
    },
    incidentState: "margin-fixed-stable-degrading",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 24,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 30,
      failureDetectionTimeMs: 0,
      quorumHealth: "normal",
      electionStabilityMechanism: "margin-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Excessive-timeout path, degrading precursor: also still quiet
  // (3000ms clears the worsening envelope too) — the trap looks just
  // as safe here as margin-fixed does, which is exactly the point: the
  // miss-streak warning is visible on BOTH paths equally, so it cannot
  // by itself distinguish "proportionate" from "excessive" margin —
  // only the crash-phase rules reveal that difference.
  {
    id: "excessive-timeout-quiet-node3-degrading",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Degrading: true },
      controlAtLeast: { [ELECTION_TIMEOUT_MS_KEY]: 3_000 },
    },
    incidentState: "excessive-timeout-quiet-degrading",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 24,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 30,
      failureDetectionTimeMs: 0,
      quorumHealth: "normal",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: healthyHealth,
  },

  // ── Spurious-election baseline, degrading precursor: already
  // unstable, and the degrading miss streak pushes leaderChangesPerMinute
  // and clusterThroughputRps modestly worse on top of the existing
  // jitter-driven instability.
  {
    id: "spurious-elections-node3-degrading",
    when: {
      triggerEquals: { networkJitterNode3: true, node3Degrading: true },
      controlAtMost: { [ELECTION_TIMEOUT_MS_KEY]: 600 },
    },
    incidentState: "spurious-elections-degrading",
    values: {
      leaderChangesPerMinute: 38,
      electionDurationMs: 560,
      requestFailureRate: 40,
      replicationLagMs: 330,
      clusterThroughputRps: 360,
      node3HeartbeatMissStreak: 30,
      failureDetectionTimeMs: 0,
      quorumHealth: "critical",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ════════════════════════════════════════════════════════════════
  // Jitter-only phase rules (networkJitterNode3 = true, no crash yet).
  // ════════════════════════════════════════════════════════════════

  // ── OPTIMAL/ACCEPTABLE candidate path: node-3 isolated from voting.
  // Its jitter can no longer trigger any election, regardless of
  // timeout/heartbeat settings. The authored cost (quorumHealth =
  // "no-slack") is real and visible, even though nothing is on fire.
  {
    id: "isolated-stable",
    when: {
      triggerEquals: { networkJitterNode3: true },
      controlEquals: { [FLAKY_NODE_ISOLATED_KEY]: true },
    },
    incidentState: "isolated-stable",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 20,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 0,
      failureDetectionTimeMs: 0,
      quorumHealth: "no-slack",
      electionStabilityMechanism: "node-isolated",
    },
    componentHealth: isolatedHealth,
  },

  // ── OPTIMAL candidate path: electionTimeoutMs=1200 with a heartbeat
  // interval that leaves real margin (<=100ms). Clears the ~900ms
  // jitter envelope comfortably without being excessive — the intended
  // sweet spot.
  {
    id: "margin-fixed-stable",
    when: {
      triggerEquals: { networkJitterNode3: true },
      controlEquals: { [ELECTION_TIMEOUT_MS_KEY]: 1_200 },
      controlAtMost: { [HEARTBEAT_INTERVAL_MS_KEY]: 100 },
    },
    incidentState: "margin-fixed-stable",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 22,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 0,
      failureDetectionTimeMs: 0,
      quorumHealth: "normal",
      electionStabilityMechanism: "margin-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── UNSAFE residual trap: electionTimeoutMs=1200 but heartbeat
  // interval widened to 200ms. Still usually clears the jitter
  // envelope, but far fewer heartbeat attempts land inside the window,
  // so an additional delayed heartbeat on top of a jitter spike
  // occasionally still trips the timeout. Low-rate but real, ongoing
  // spurious elections — raising the timeout alone was not quite
  // sufficient here.
  {
    id: "timeout-fixed-heartbeat-too-sparse",
    when: {
      triggerEquals: { networkJitterNode3: true },
      controlEquals: { [ELECTION_TIMEOUT_MS_KEY]: 1_200, [HEARTBEAT_INTERVAL_MS_KEY]: 200 },
    },
    incidentState: "timeout-fixed-heartbeat-too-sparse",
    values: {
      leaderChangesPerMinute: 3,
      electionDurationMs: 480,
      requestFailureRate: 9,
      replicationLagMs: 60,
      clusterThroughputRps: 870,
      node3HeartbeatMissStreak: 4,
      failureDetectionTimeMs: 0,
      quorumHealth: "warning",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── UNSAFE: electionTimeoutMs=3000. Looks identical to the stable
  // margin-fixed path right now — zero spurious elections, healthy
  // metrics — which is exactly why it is a trap: its real cost only
  // shows up once node-3 genuinely fails (see the crash-phase rules
  // above). electionStabilityMechanism stays "unresolved" because the
  // jitter was never given a proportionate fix, just an oversized one.
  {
    id: "excessive-timeout-quiet-but-unproven",
    when: {
      triggerEquals: { networkJitterNode3: true },
      controlAtLeast: { [ELECTION_TIMEOUT_MS_KEY]: 3_000 },
    },
    incidentState: "excessive-timeout-quiet-but-unproven",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 22,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 0,
      failureDetectionTimeMs: 0,
      quorumHealth: "normal",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: healthyHealth,
  },

  // ── UNSAFE, worst: electionTimeoutMs<=600, aggressive client
  // retries, and a widened voting set (5 voters) — the compounding
  // worst case. The timeout is still far short of the jitter envelope
  // (continuous spurious elections), aggressive retries multiply
  // request volume against a leaderless cluster every time, and the
  // wider voting set adds consensus overhead to every one of those
  // frequent elections rather than helping.
  {
    id: "spurious-elections-worst-case",
    when: {
      triggerEquals: { networkJitterNode3: true },
      controlAtMost: { [ELECTION_TIMEOUT_MS_KEY]: 600 },
      controlEquals: { [CLIENT_RETRY_BEHAVIOR_KEY]: "aggressive" },
      controlAtLeast: { [QUORUM_VOTING_SET_SIZE_KEY]: 5 },
    },
    incidentState: "spurious-elections-worst-case",
    values: {
      leaderChangesPerMinute: 48,
      electionDurationMs: 620,
      requestFailureRate: 64,
      replicationLagMs: 410,
      clusterThroughputRps: 140,
      node3HeartbeatMissStreak: 22,
      failureDetectionTimeMs: 0,
      quorumHealth: "critical",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── UNSAFE: electionTimeoutMs<=600 with aggressive client retries
  // (default voting set size). Continuous spurious elections, and
  // every one of them is compounded by a burst of immediate client
  // retries hammering a momentarily leaderless cluster.
  {
    id: "spurious-elections-aggressive-retries",
    when: {
      triggerEquals: { networkJitterNode3: true },
      controlAtMost: { [ELECTION_TIMEOUT_MS_KEY]: 600 },
      controlEquals: { [CLIENT_RETRY_BEHAVIOR_KEY]: "aggressive" },
    },
    incidentState: "spurious-elections-aggressive-retries",
    values: {
      leaderChangesPerMinute: 40,
      electionDurationMs: 580,
      requestFailureRate: 52,
      replicationLagMs: 360,
      clusterThroughputRps: 220,
      node3HeartbeatMissStreak: 18,
      failureDetectionTimeMs: 0,
      quorumHealth: "critical",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── UNSAFE baseline: electionTimeoutMs<=600 (nowhere near the
  // jitter envelope), backoff retries. Continuous spurious elections
  // still occur — the retry policy only changes how much the
  // instability is amplified, not whether it happens — but throughput
  // collapse is less severe without aggressive retries piling on.
  {
    id: "spurious-elections-baseline",
    when: {
      triggerEquals: { networkJitterNode3: true },
      controlAtMost: { [ELECTION_TIMEOUT_MS_KEY]: 600 },
    },
    incidentState: "spurious-elections-baseline",
    values: {
      leaderChangesPerMinute: 32,
      electionDurationMs: 540,
      requestFailureRate: 34,
      replicationLagMs: 310,
      clusterThroughputRps: 420,
      node3HeartbeatMissStreak: 14,
      failureDetectionTimeMs: 0,
      quorumHealth: "critical",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      leaderChangesPerMinute: 0,
      electionDurationMs: 0,
      requestFailureRate: 1,
      replicationLagMs: 20,
      clusterThroughputRps: 1_000,
      node3HeartbeatMissStreak: 0,
      failureDetectionTimeMs: 0,
      quorumHealth: "normal",
      electionStabilityMechanism: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
