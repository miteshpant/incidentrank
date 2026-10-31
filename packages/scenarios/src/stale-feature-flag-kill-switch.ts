import type { ScenarioDefinition } from "./types";
import {
  DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
  INSPECT_FLAG_AUDIT_LOG_KEY,
  INSPECT_LEGACY_ENGINE_LOGS_KEY,
  RESTART_CHECKOUT_SERVICE_KEY,
  REVERT_UNRELATED_FLAG_KEY,
  staleFeatureFlagKillSwitchSimulation,
} from "./stale-feature-flag-kill-switch/definition";
import { staleFeatureFlagKillSwitchCandidateUI } from "./stale-feature-flag-kill-switch/candidate-ui";
import { STALE_FEATURE_FLAG_KILL_SWITCH_SCORING } from "./stale-feature-flag-kill-switch/scoring";

/**
 * Stale Feature-Flag Kill Switch — an intermediate, linear-structured
 * IncidentRank scenario. A feature flag meant to be temporary
 * (`legacyPricingEngineKillSwitchEnabled`, gating a legacy pricing
 * engine that was supposedly replaced months ago) was never cleaned up.
 * The bug itself shipped safely a long time ago and has sat completely
 * dormant ever since — nothing new was deployed, nothing new was
 * configured. The incident begins only when an on-call engineer flips a
 * completely unrelated, seemingly-safe flag (a routine checkout UI
 * layout rollout) and the flag-evaluation order in the feature-flag
 * service re-enables the dormant legacy pricing engine as a side effect.
 *
 * This is flag-hygiene debt resurfacing weeks later, not a bad new
 * deploy causing an immediate regression: the central trap is that once
 * woken, the legacy engine's own kill switch is now latched on
 * independently of what originally triggered it — reverting the
 * unrelated flag back to its old value does NOT put the legacy engine
 * back to sleep. The candidate must trace the symptom back to the
 * actual stale flag and disable it directly.
 */
export const staleFeatureFlagKillSwitch: ScenarioDefinition = {
  id: "stale-feature-flag-kill-switch",
  slug: "stale-feature-flag-kill-switch",
  version: 1,
  name: "Stale Feature-Flag Kill Switch",
  description:
    "Checkout prices have started mismatching cart totals. Nothing was deployed today — nothing was deployed this week. The only thing that changed was an on-call engineer flipping an unrelated, seemingly-safe checkout layout flag for a routine rollout. Minutes later, a legacy pricing engine that was supposedly retired months ago started actively computing prices again. Its own kill switch was never actually removed — just forgotten — and the unrelated flag change woke it up as a side effect. Reverting the flag that triggered the wake-up will not put it back to sleep: that flag only controls whether the trigger fires again, not whether the legacy engine itself stays active. Trace the symptom back to the stale flag and disable it directly.",
  difficulty: "intermediate",
  estimatedMinutes: 12,
  isFree: false,
  structure: "linear",
  simulation: staleFeatureFlagKillSwitchSimulation,
  library: {
    category: "Deployments & Reliability",
    tags: ["Feature Flags", "Flag Hygiene", "Dead Code", "Kill Switch", "Dormant Bug"],
    primarySkill: "Recognizing flag-hygiene debt woken by an unrelated change",
    skills: [
      "Distinguishing dormant flag debt from an immediate bad-deploy regression",
      "Tracing a symptom back to a stale flag rather than the change that merely triggered it",
      "Recognizing that reverting a trigger does not undo an already-latched side effect",
      "Verifying the actual root-cause flag is disabled, not just the proximate change",
    ],
    shortDescription:
      "An unrelated, seemingly-safe flag flip wakes a long-dormant legacy pricing engine — reverting the flag that triggered it doesn't put it back to sleep.",
  },
};

export {
  staleFeatureFlagKillSwitchSimulation,
  staleFeatureFlagKillSwitchCandidateUI,
  STALE_FEATURE_FLAG_KILL_SWITCH_SCORING,
  DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
  INSPECT_FLAG_AUDIT_LOG_KEY,
  INSPECT_LEGACY_ENGINE_LOGS_KEY,
  RESTART_CHECKOUT_SERVICE_KEY,
  REVERT_UNRELATED_FLAG_KEY,
};
