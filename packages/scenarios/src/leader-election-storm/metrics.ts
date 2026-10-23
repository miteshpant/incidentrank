import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  leaderChangesPerMinute: 0,
  electionDurationMs: 0,
  requestFailureRate: 1,
  replicationLagMs: 20,
  clusterThroughputRps: 1_000,
  node3HeartbeatMissStreak: 0,
  failureDetectionTimeMs: 0,
  quorumHealth: "normal",
  // Generic string-state field distinguishing WHY the cluster is quiet —
  // "unresolved" (incident ongoing / not yet addressed), "margin-fixed"
  // (timeout raised with real margin over the jitter envelope, root
  // cause of spurious elections addressed), "node-isolated" (the flaky
  // node removed from voting, a valid complementary/alternate fix), or
  // "masked" (timeout raised just enough to stop visible flapping but
  // without real margin, or some other partial state). Read only by
  // successCondition/scoring's dataIntegrity-adjacent measure, never by
  // any scenario-specific scorer code.
  electionStabilityMechanism: "unresolved",
};
