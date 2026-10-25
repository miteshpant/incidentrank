import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BALANCE_CONSISTENCY_MODE_KEY,
  CATALOG_CONSISTENCY_MODE_KEY,
  CATALOG_RECONCILIATION_KEY,
  QUORUM_REQUIREMENT_KEY,
  UNCONFIRMED_WRITE_POLICY_KEY,
  WRITE_ROUTING_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only -- never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement. Ids are stable and intentionally neutral, never
 * self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: BALANCE_CONSISTENCY_MODE_KEY,
    valueEquals: "strong",
    whenTriggerEquals: { connectivityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Required cross-region confirmation for balance writes",
      explanation:
        "Switching balance writes to strong consistency means a write is only accepted once both regions have cross-confirmed it. During a cross-region connectivity problem this costs real write availability on balance operations -- some writes get queued or rejected rather than applied immediately -- but it is the only choice that keeps a correctness-critical operation category from ever processing a write against stale or unconfirmed data while the two regions can't reliably see each other.",
    },
  },
  {
    id: "acr_2",
    controlKey: BALANCE_CONSISTENCY_MODE_KEY,
    valueEquals: "relaxed",
    whenTriggerEquals: { connectivityDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Left balance writes accepting local-only confirmation",
      explanation:
        "Leaving balance consistency at relaxed means each region keeps applying balance writes from only its own local view, with no cross-region confirmation. During this connectivity problem that is exactly what lets two regions independently accept conflicting writes against the same account with neither side aware of the other -- and because each region's own write-availability metric still reads 100, nothing in a surface-level availability dashboard signals that anything has gone wrong.",
    },
  },
  {
    id: "acr_3",
    controlKey: QUORUM_REQUIREMENT_KEY,
    valueEquals: "local-only",
    whenTriggerEquals: { connectivityDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Removed the cross-region check behind strong mode",
      explanation:
        "Setting quorum requirement to local-only removes the cross-region confirmation that strong consistency depends on, even while the balance consistency control itself still reads \"strong\". The category control looks safe, but the mechanism actually backing that guarantee has been pulled out -- the practical effect on balance writes during this connectivity problem is identical to relaxing consistency outright.",
    },
  },
  {
    id: "acr_4",
    controlKey: QUORUM_REQUIREMENT_KEY,
    valueEquals: "both-regions",
    whenTriggerEquals: { connectivityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Kept the cross-region quorum check intact",
      explanation:
        "Keeping quorum requirement at both-regions ensures the strong consistency setting actually means what it says: a balance write only gets accepted once genuinely cross-confirmed. This is what makes strong mode a real, structural guarantee rather than a label with nothing enforcing it.",
    },
  },
  {
    id: "acr_5",
    controlKey: CATALOG_CONSISTENCY_MODE_KEY,
    valueEquals: "relaxed",
    whenTriggerEquals: { connectivityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Relaxed consistency on the staleness-tolerant category",
      explanation:
        "Relaxing catalog consistency lets each region keep serving and accepting catalog writes from its own local view, preserving full availability on a category the business has explicitly said may tolerate a few seconds of staleness. Because catalog entries have no correctness concept like a double-spend, this choice carries only a bounded, business-acceptable staleness cost -- never a correctness violation -- and is the key move that differentiates handling by actual business need rather than treating every operation the same.",
    },
  },
  {
    id: "acr_6",
    controlKey: CATALOG_CONSISTENCY_MODE_KEY,
    valueEquals: "strong",
    whenTriggerEquals: { connectivityDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Held catalog writes to the same strong guarantee as balance",
      explanation:
        "Applying strong consistency to catalog writes is not unsafe -- it simply treats a staleness-tolerant category with the same guarantee as the consistency-critical one, sacrificing availability on catalog traffic that never needed cross-region confirmation in the first place. It is a legitimate, conservative choice (Strategy A: prioritize consistency everywhere) rather than a mistake, but it leaves real, avoidable availability on the table for this category specifically.",
    },
  },
  {
    id: "acr_7",
    controlKey: WRITE_ROUTING_KEY,
    valueEquals: "single-region-a",
    whenTriggerEquals: { connectivityDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Routed all write traffic to a single region",
      explanation:
        "Forcing every write -- both balance and catalog -- onto one named region does structurally prevent any cross-region conflict, since there is no longer a second region accepting writes at all. The tradeoff: catalog traffic, which never needed that constraint, is now also concentrated onto a single region, and all customer write traffic now depends on that one region's capacity and proximity rather than being split across both.",
    },
  },
  {
    id: "acr_8",
    controlKey: UNCONFIRMED_WRITE_POLICY_KEY,
    valueEquals: "reject",
    whenTriggerEquals: { connectivityDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Rejected unconfirmable balance writes immediately",
      explanation:
        "Rejecting a balance write that can't get cross-region confirmation gives the client immediate, explicit feedback rather than holding the request. The tradeoff is that the write itself does not happen at all unless the client retries once connectivity returns -- faster failure, but no automatic eventual completion the way queuing provides.",
    },
  },
  {
    id: "acr_9",
    controlKey: UNCONFIRMED_WRITE_POLICY_KEY,
    valueEquals: "queue",
    whenTriggerEquals: { connectivityDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Queued unconfirmable balance writes",
      explanation:
        "Queuing a balance write that can't get cross-region confirmation keeps it eligible to apply automatically once connectivity returns, with no retry required from the client. The tradeoff is added queue depth and latency visible to the caller for the duration of the connectivity problem, rather than an immediate explicit failure.",
    },
  },
  {
    id: "acr_10",
    controlKey: CATALOG_RECONCILIATION_KEY,
    valueEquals: "merge-latest-per-field",
    whenTriggerEquals: { connectivityRestored: true },
    outcome: "neutral",
    feedback: {
      title: "Reconciled catalog divergence field-by-field",
      explanation:
        "Merge-latest-per-field avoids discarding an unrelated field's update just because another field on the same catalog entry also changed on the other side. The tradeoff is speed: it takes longer to fully converge than simply picking a winner by timestamp for the whole record.",
    },
  },
];
