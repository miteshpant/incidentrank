import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  FENCING_ACTION_KEY,
  QUORUM_REQUIREMENT_KEY,
  RECONCILIATION_POLICY_KEY,
  REGION_A_ACCESS_KEY,
  REGION_B_ACCESS_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only -- never read by resolution logic. Every rule carries
 * `feedback` per Phase 6B's mandatory post-incident-feedback requirement
 * (docs/implementation_plan/phase6b.md section 13). Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: QUORUM_REQUIREMENT_KEY,
    valueEquals: "majority",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "beneficial",
    feedback: {
      title: "Required a real majority to stay writable",
      explanation:
        "Requiring majority quorum means a region can only accept writes while it can see a genuine majority of cluster nodes. During a network partition, at most one side of a two-region split can ever satisfy that -- so this change alone structurally prevents both regions from simultaneously believing they hold leadership, without needing to manually pick which single region to fence.",
    },
  },
  {
    id: "acr_2",
    controlKey: QUORUM_REQUIREMENT_KEY,
    valueEquals: "any-single-region",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "harmful",
    feedback: {
      title: "Left each side free to self-authorize",
      explanation:
        "Leaving quorum at any-single-region means each region decides it is authoritative using only its own local view, with no cross-region majority check. During a partition this is exactly what lets both sides accept writes at the same time -- and because each region's own availability metrics look fully healthy while this is happening, nothing in the customer-facing dashboards signals that anything is wrong.",
    },
  },
  {
    id: "acr_3",
    controlKey: FENCING_ACTION_KEY,
    valueEquals: "fence-region-b",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "beneficial",
    feedback: {
      title: "Fenced the non-majority side",
      explanation:
        "Explicitly fencing Region B forces it to immediately stop accepting writes, regardless of what its own local quorum check would otherwise decide. Because Region B was the side that could never have held a genuine cluster majority during this partition, fencing it costs nothing that wasn't already unsafe to keep, while making Region A's sole write authority immediate and explicit rather than waiting on quorum logic to converge.",
    },
  },
  {
    id: "acr_4",
    controlKey: FENCING_ACTION_KEY,
    valueEquals: "fence-region-a",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "harmful",
    feedback: {
      title: "Fenced the side that could have stayed up",
      explanation:
        "Fencing Region A took down the side that structurally held the cluster's real majority during this partition, sacrificing its write availability for no correctness benefit -- Region B, which was never going to achieve real quorum on its own, was left as the sole writer instead. The resulting state is not corrupt, but it traded away availability on the side that didn't need to lose it.",
    },
  },
  {
    id: "acr_5",
    controlKey: REGION_A_ACCESS_KEY,
    valueEquals: "read-write",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "neutral",
    feedback: {
      title: "Kept Region A write-enabled during the partition",
      explanation:
        "Leaving Region A in read-write mode is only safe once something else -- majority quorum, explicit fencing of Region B, or manually setting Region B to read-only/offline -- guarantees Region B cannot also be accepting writes at the same time. On its own, this control choice is neither the fix nor the problem; what matters is whether the OTHER side has genuinely been taken off the write path.",
    },
  },
  {
    id: "acr_6",
    controlKey: REGION_B_ACCESS_KEY,
    valueEquals: "offline",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "neutral",
    feedback: {
      title: "Took Region B fully offline",
      explanation:
        "Taking Region B fully offline (rather than read-only) does stop it from writing, which is safe, but it also stops Region B from serving reads at all -- a stricter availability cost than necessary if Region B's reads were still serving traffic safely. Read-only would have achieved the same correctness guarantee at a smaller customer-visible cost.",
    },
  },
  {
    id: "acr_7",
    controlKey: RECONCILIATION_POLICY_KEY,
    valueEquals: "last-write-wins",
    whenTriggerEquals: { networkHealed: true },
    outcome: "neutral",
    feedback: {
      title: "Converged the backlog by timestamp",
      explanation:
        "Last-write-wins resolves every conflicting key immediately by picking whichever write has the later timestamp, clearing the reconciliation backlog fast. The tradeoff is real: for every key where both regions actually wrote different values, one of those writes is silently discarded rather than reviewed -- fast convergence in exchange for an unreviewed, automatic resolution of every conflict.",
    },
  },
  {
    id: "acr_8",
    controlKey: RECONCILIATION_POLICY_KEY,
    valueEquals: "manual-review",
    whenTriggerEquals: { networkHealed: true },
    outcome: "neutral",
    feedback: {
      title: "Held every conflict for manual review",
      explanation:
        "Manual-review blocks any conflicting key from converging automatically until a human inspects it, so no write is ever silently discarded. The tradeoff is speed: the reconciliation backlog stays visibly unresolved for longer than either of the automatic policies, since every genuine conflict now waits on a human decision.",
    },
  },
];
