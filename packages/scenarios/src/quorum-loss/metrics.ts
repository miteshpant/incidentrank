import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  /** How many of the current voting membership are reachable right now. */
  healthyNodeCount: 5,
  /** How many votes are required for the current voting membership to
   * reach a genuine majority (ceil(membership/2)). Mirrors
   * healthyNodeCount's denominator so the candidate can read the margin
   * directly off these two numbers. */
  quorumRequiredCount: 3,
  /** Whether the group genuinely holds quorum right now
   * (healthyNodeCount >= quorumRequiredCount) — "normal" with margin,
   * "warning" at the edge (exactly at the threshold, one more loss away
   * from unsafe), "critical" once genuinely below it. */
  quorumStatus: "normal",
  leaderHealth: "healthy",
  writeAvailability: 100,
  replicationStatus: "current",
  /** Node C's reachability signal in the lead-up to the second wave —
   * the observable precursor a candidate can watch before Node C
   * actually goes unreachable. */
  nodeCHeartbeatHealth: "normal",
  /**
   * The real correctness field. Zero while the group has never accepted
   * a write without genuine majority agreement. Becomes and stays
   * nonzero the moment ANY write is accepted while healthyNodeCount is
   * below quorumRequiredCount — read only by successCondition/
   * acceptableCondition/scoring's dataIntegrity measure, never reset by
   * any control, and never substitutable by a healthy-looking
   * writeAvailability number.
   */
  unsafeWriteCount: 0,
};
