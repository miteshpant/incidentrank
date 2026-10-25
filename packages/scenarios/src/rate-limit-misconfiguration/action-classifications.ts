import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BURST_SIZE_KEY,
  EMERGENCY_BYPASS_KEY,
  GLOBAL_QUOTA_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  RATE_LIMIT_POLICY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement. Ids are stable and intentionally neutral, never
 * self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: EMERGENCY_BYPASS_KEY,
    valueEquals: true,
    whenTriggerEquals: { policyEffectsVisible: true },
    outcome: "harmful",
    feedback: {
      title: "Removed protection instead of fixing it",
      explanation:
        "The emergency bypass stopped every rejection immediately, and customer-facing success metrics looked fully healthy. But the bypass doesn't fix the policy — it removes the limiter's enforcement entirely, so nothing stops the high-volume tenant from consuming a disproportionate share of shared capacity again. The fairness protection the limiter exists to provide was gone, even though the dashboards looked calm.",
    },
  },
  {
    id: "acr_2",
    controlKey: BURST_SIZE_KEY,
    valueAtMost: 200,
    whenTriggerEquals: { policyEffectsVisible: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped how far any tenant could spike",
      explanation:
        "Tightening the burst size directly limited how much any single tenant — including the high-volume one — could spike above its own quota in a short window. This is the lever that actually caps domination; raising the per-tenant or global quota alone would have left it untouched.",
    },
  },
  {
    id: "acr_3",
    controlKey: PER_TENANT_QUOTA_KEY,
    valueAtLeast: 400,
    whenTriggerEquals: { policyEffectsVisible: true },
    outcome: "beneficial",
    feedback: {
      title: "Relieved the too-tight steady-state ceiling",
      explanation:
        "Raising the per-tenant quota gave legitimate, steady-volume tenants enough headroom that they stopped being throttled by the newly deployed policy's overly tight default. On its own this does not address burst domination — pairing it with a tightened burst size is what closes both halves of the root cause.",
    },
  },
  {
    id: "acr_4",
    controlKey: RATE_LIMIT_POLICY_KEY,
    valueEquals: "previous-policy",
    whenTriggerEquals: { policyEffectsVisible: true },
    outcome: "harmful",
    feedback: {
      title: "Rolled back the symptom, not the cause",
      explanation:
        "Reverting to the previous policy relieved legitimate tenants, since the old steady-state quota wasn't too tight. But it also reverted burst size to the same generous allowance that let the dominant tenant spike past a fair share in the first place — the rollback undid the throttling complaint without touching the actual misconfiguration.",
    },
  },
  {
    id: "acr_5",
    controlKey: GLOBAL_QUOTA_KEY,
    valueAtLeast: 20_000,
    whenTriggerEquals: { policyEffectsVisible: true },
    outcome: "harmful",
    feedback: {
      title: "Added capacity to the wrong lever",
      explanation:
        "Raising the global quota added more total shared capacity, but the dominant tenant immediately claimed a larger absolute share of the new headroom too — its proportion of capacity did not improve, infrastructure cost rose, and legitimate tenants were still throttled by the untouched per-tenant quota. More capacity does not fix an unfair allocation of it.",
    },
  },
  {
    id: "acr_6",
    controlKey: PRIORITY_CLASS_KEY,
    valueEquals: "favor-steady",
    whenTriggerEquals: { policyEffectsVisible: true },
    outcome: "neutral",
    feedback: {
      title: "Protected steady tenants without capping the burster",
      explanation:
        "Favoring steady tenants under contention let legitimate traffic get admitted ahead of the burst, recovering legitimate success without touching burst size. This is a genuine, defensible tradeoff — but it does not, by itself, put a hard ceiling on how much the dominant tenant can still consume, the way directly tightening burst size does.",
    },
  },
];
