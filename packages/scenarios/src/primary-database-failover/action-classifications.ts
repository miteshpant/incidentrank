import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CONNECTION_DRAIN_KEY,
  FAILOVER_INITIATED_KEY,
  OLD_PRIMARY_FENCING_KEY,
  PROMOTION_TIMING_KEY,
  WRITE_ROUTING_POLICY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every rule carries
 * `feedback` per Phase 6B's mandatory post-incident-feedback requirement
 * (docs/implementation_plan/phase6b.md section 13). Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: PROMOTION_TIMING_KEY,
    valueEquals: "waitForLagDrain",
    whenTriggerEquals: { primaryDegrading: true },
    outcome: "beneficial",
    feedback: {
      title: "Waited for replication lag to drain before promoting",
      explanation:
        "Holding promotion until the replica's replication lag had drained to near-zero guaranteed the promoted node had every write the old primary had acknowledged. Combined with fencing the old primary afterward, this reached full recovery with zero lost writes and zero ongoing correctness risk — the slower path, but the only one that is both fast enough and provably clean.",
    },
  },
  {
    id: "acr_2",
    controlKey: OLD_PRIMARY_FENCING_KEY,
    valueEquals: true,
    whenTriggerEquals: { primaryDegrading: true },
    outcome: "beneficial",
    feedback: {
      title: "Fenced the old primary",
      explanation:
        "Fencing permanently revoked the old primary's ability to accept further writes at the moment of promotion. This closes the split-primary hazard immediately even if promotion happens before replication lag has fully drained — the real cost of promoting early becomes a one-time, bounded set of lost writes instead of an open-ended risk of two nodes accepting writes at once.",
    },
  },
  {
    id: "acr_3",
    controlKey: CONNECTION_DRAIN_KEY,
    valueEquals: true,
    whenTriggerEquals: { primaryDegrading: true },
    outcome: "beneficial",
    feedback: {
      title: "Drained connections before cutover",
      explanation:
        "Letting in-flight transactions against the old primary finish before cutting traffic over avoided severing them mid-write. This reduced the size of the one-time write loss at the moment of promotion, on top of whatever fencing and lag-draining decisions were made.",
    },
  },
  {
    id: "acr_4",
    controlKey: PROMOTION_TIMING_KEY,
    valueEquals: "immediate",
    whenTriggerEquals: { primaryDegrading: true },
    outcome: "harmful",
    feedback: {
      title: "Promoted before replication lag drained, without fencing",
      explanation:
        "Promoting the replica immediately restored availability quickly, but without the old primary being fenced, both the old primary and the newly promoted replica remained able to accept writes at the same time. Write and read success rates looked fully recovered, which is exactly why this risk is dangerous: nothing in the availability metrics reveals that stale writes are still accumulating against a node that should no longer be authoritative.",
    },
  },
  {
    id: "acr_5",
    controlKey: WRITE_ROUTING_POLICY_KEY,
    valueEquals: "newPrimary",
    whenTriggerEquals: { primaryDegrading: true },
    outcome: "neutral",
    feedback: {
      title: "Cut write traffic over to the promoted replica",
      explanation:
        "Moving write routing to the newly promoted replica is a necessary step in completing a failover, but on its own it says nothing about whether the cutover was safe — that depends entirely on whether the old primary was fenced and how much replication lag remained when promotion happened.",
    },
  },
  {
    id: "acr_6",
    controlKey: FAILOVER_INITIATED_KEY,
    valueEquals: false,
    whenTriggerEquals: { primaryUnavailable: true },
    outcome: "harmful",
    feedback: {
      title: "Left the primary unavailable with no failover",
      explanation:
        "Once the primary became fully unavailable, writes failed outright with no failover initiated at all. Waiting does not recover availability on its own — a deliberate promotion decision, with its own safety tradeoffs, is required to restore write capability.",
    },
  },
];
