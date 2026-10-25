import type { TimedEvent } from "@incidentrank/simulator";

/**
 * The replication-policy change that triggers this incident has ALREADY
 * happened by the time the candidate is paged — this is deliberately
 * framed as a historical fact ("was widened"), never an ongoing outage.
 * Nothing is failing. Cross-region transfer, replication fan-out, and
 * storage duplication are all now sharply higher than before, and stay
 * exactly that high for as long as the candidate leaves every control at
 * its inherited post-change default.
 */
const POLICY_CHANGE_DISCOVERED_MS = 30_000;

/**
 * A previously-scheduled disaster-recovery verification drill runs
 * against the critical data class. This is a planned, authored audit
 * event, never a live outage — it exists purely to test whether
 * critical data's durability floor is ACTUALLY being honored right now.
 * If the candidate has weakened criticalReplicationFactor below the
 * policy floor (and not engaged criticalDataPinning) by the time this
 * drill runs, rules.ts records a real, permanent exposure consequence;
 * if critical data is still policy-compliant, the drill passes cleanly
 * and leaves no mark.
 */
const DR_VERIFICATION_DRILL_MS = POLICY_CHANGE_DISCOVERED_MS + 3 * 60_000;

/** A second, later DR drill — proves the exposure consequence is about
 * whether the floor was breached AT DRILL TIME, not merely "was ever
 * breached for one instant anywhere in the run": a candidate who fixes
 * the floor before this second drill adds no further exposure, while
 * one who is still below the floor when it runs accrues more. */
const DR_VERIFICATION_DRILL_2_MS = DR_VERIFICATION_DRILL_MS + 4 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "policy-change-discovered",
    atMs: POLICY_CHANGE_DISCOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "A replication-policy change applied last week widened cross-region fan-out and switched every data class to synchronous replication. Freshness is excellent across every class, but cross-region transfer, replication fan-out, and storage-duplication cost have all risen sharply and show no sign of coming back down on their own. Nothing is currently failing.",
    setTriggers: { policyChangeDiscovered: true },
  },
  {
    id: "dr-verification-drill",
    atMs: DR_VERIFICATION_DRILL_MS,
    type: "TRIGGER_SET",
    message:
      "A previously-scheduled disaster-recovery verification drill is now running against the critical data class, checking whether its mandated regional durability floor is actually being honored right now.",
    setTriggers: { policyChangeDiscovered: true, drDrillActive: true },
  },
  {
    id: "dr-verification-drill-2",
    atMs: DR_VERIFICATION_DRILL_2_MS,
    type: "TRIGGER_SET",
    message:
      "A second, later disaster-recovery verification drill is now running against the critical data class.",
    setTriggers: { policyChangeDiscovered: true, drDrillActive: true, drDrill2Active: true },
  },
];

export { POLICY_CHANGE_DISCOVERED_MS, DR_VERIFICATION_DRILL_MS, DR_VERIFICATION_DRILL_2_MS };
