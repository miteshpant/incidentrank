import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
  INSPECT_FLAG_AUDIT_LOG_KEY,
  INSPECT_LEGACY_ENGINE_LOGS_KEY,
  RESTART_CHECKOUT_SERVICE_KEY,
  REVERT_UNRELATED_FLAG_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_FLAG_AUDIT_LOG_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_LEGACY_ENGINE_LOGS_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
    valueEquals: true,
    whenTriggerEquals: { legacyEngineWoken: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: the legacy pricing engine's own kill switch",
      explanation:
        "The legacy pricing engine was never actually removed — just hidden behind a flag nobody cleaned up. An unrelated flag flip woke it, and once woken it stays active independently of what originally triggered it. Disabling its own kill switch is the only thing that puts it back to sleep.",
    },
  },
  {
    controlKey: REVERT_UNRELATED_FLAG_KEY,
    valueEquals: false,
    whenTriggerEquals: { legacyEngineWoken: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: reverting the unrelated flag",
      explanation:
        "Reverting newCheckoutLayoutFlagEnabled stops the ORIGINAL trigger from firing again, but the legacy pricing engine's kill switch was already latched on independently when it woke — reverting the trigger does not put it back to sleep.",
    },
  },
  {
    controlKey: RESTART_CHECKOUT_SERVICE_KEY,
    valueEquals: true,
    whenTriggerEquals: { legacyEngineWoken: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting the checkout service",
      explanation:
        "Restarting checkout-service clears its in-memory pricing cache for a moment, but the legacy pricing engine is still active — the cache refills with mismatched prices on the very next round of checkout traffic.",
    },
  },
];
