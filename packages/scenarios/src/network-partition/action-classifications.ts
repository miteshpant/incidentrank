import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  LEDGER_AUTHORITATIVE_REGION_KEY,
  LEDGER_READ_MODE_KEY,
  LEDGER_WRITE_ROUTING_KEY,
  PROFILE_CONSISTENCY_MODE_KEY,
  REGION_A_ISOLATION_KEY,
  REGION_B_ISOLATION_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only -- never read by resolution logic. Every rule carries
 * `feedback` per the mandatory post-incident-feedback requirement. Ids
 * are stable and intentionally neutral, never self-descriptive of the
 * authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: LEDGER_WRITE_ROUTING_KEY,
    valueEquals: "single-region-authoritative",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "beneficial",
    feedback: {
      title: "Routed every ledger write through one region",
      explanation:
        "Routing ledger writes through exactly one authoritative region regardless of where a request lands means at most one side can ever accept a balance-affecting write at a time. During a network partition this structurally prevents divergent ledger writes without needing to manually isolate a region by hand -- and it stays safe through any future partition too, not just this one.",
    },
  },
  {
    id: "acr_2",
    controlKey: LEDGER_WRITE_ROUTING_KEY,
    valueEquals: "local-region-authoritative",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "harmful",
    feedback: {
      title: "Left each region free to accept ledger writes locally",
      explanation:
        "Leaving ledger routing at local-region-authoritative means each region accepts the ledger writes it receives using only its own local view, with no cross-region check. During a partition this is exactly what lets both regions accept divergent balance-affecting writes at the same time -- and because each region's own availability metrics still read 100%, nothing in the customer-facing dashboards signals that ledger data is actually diverging.",
    },
  },
  {
    id: "acr_3",
    controlKey: REGION_B_ISOLATION_KEY,
    valueEquals: "read-only",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "beneficial",
    feedback: {
      title: "Manually isolated Region B's writes",
      explanation:
        "Setting Region B to read-only stops it from accepting ledger writes immediately, leaving Region A as the sole ledger writer -- genuinely safe right now. The tradeoff is that this relies on the candidate having isolated the correct region by hand rather than on the structural single-region-authoritative routing fix, so it would need to be redone correctly if the situation changed (for example, if Region B were reinstated before the routing control was also fixed).",
    },
  },
  {
    id: "acr_4",
    controlKey: REGION_A_ISOLATION_KEY,
    valueEquals: "isolated",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "neutral",
    feedback: {
      title: "Took Region A fully offline",
      explanation:
        "Taking Region A fully offline (rather than read-only) does remove it from the ledger write path, which is safe, but it also stops Region A from serving any reads at all -- a stricter availability cost than necessary if Region A's reads could otherwise have kept serving traffic safely. Read-only would have achieved the same ledger-safety guarantee at a smaller customer-visible cost.",
    },
  },
  {
    id: "acr_5",
    controlKey: REGION_A_ISOLATION_KEY,
    valueEquals: "isolated",
    whenTriggerEquals: { networkHealed: false },
    outcome: "neutral",
    feedback: {
      title: "Isolated Region A before any partition was confirmed",
      explanation:
        "Isolating a region before there is any confirmed partition or ledger-routing problem removes its capacity for no yet-demonstrated benefit. This control only pays off once there is an actual cross-region write-safety risk to respond to.",
    },
  },
  {
    id: "acr_6",
    controlKey: LEDGER_READ_MODE_KEY,
    valueEquals: "block-stale-reads",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "beneficial",
    feedback: {
      title: "Blocked potentially stale ledger reads",
      explanation:
        "Blocking stale ledger reads in the non-authoritative region means a customer can never be shown an account balance that is behind the authoritative region's latest write. The tradeoff is read availability: that region can no longer serve ledger reads at all during the partition, rather than serving them with a staleness caveat.",
    },
  },
  {
    id: "acr_7",
    controlKey: PROFILE_CONSISTENCY_MODE_KEY,
    valueEquals: "eventual-multi-region",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "neutral",
    feedback: {
      title: "Kept profile writes available in both regions",
      explanation:
        "Profile data (display name, UI preferences) was explicitly allowed by the business to tolerate temporary staleness during a partition. Keeping profileConsistencyMode at eventual-multi-region accepts a real, bounded staleness/reconciliation cost in exchange for full profile-write availability in both regions -- a deliberate, defensible tradeoff for this specific, non-ledger data category.",
    },
  },
  {
    id: "acr_8",
    controlKey: PROFILE_CONSISTENCY_MODE_KEY,
    valueEquals: "strong-single-region",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "neutral",
    feedback: {
      title: "Applied strong consistency to profile writes too",
      explanation:
        "Routing profile writes through a single region eliminates staleness entirely for that data, but the business never required strong consistency for display names or UI preferences -- this is a stricter, more conservative choice than necessary, trading away profile-write availability in the non-authoritative region for a correctness guarantee that data category did not need.",
    },
  },
  {
    id: "acr_9",
    controlKey: LEDGER_AUTHORITATIVE_REGION_KEY,
    valueEquals: "region-b",
    whenTriggerEquals: { networkPartitioned: true },
    outcome: "neutral",
    feedback: {
      title: "Chose Region B as the ledger-authoritative region",
      explanation:
        "Once single-region ledger routing is enabled, choosing which region is authoritative is a business/latency decision, not a correctness one -- either region works equally safely, with the tradeoff being which region's customers keep full ledger write availability versus which region now serves only reads.",
    },
  },
];
