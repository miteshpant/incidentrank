import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DEPENDENCY_PROTECTION_MODE_KEY,
  NEW_VERSION_INSTANCE_COUNT_KEY,
  REGRESSED_FEATURE_ENABLED_KEY,
  ROLLBACK_TO_OLD_VERSION_KEY,
  ROLLOUT_PERCENT_KEY,
  TRAFFIC_ROUTING_MODE_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per section 14's mandatory post-incident-
 * feedback requirement. Ids are stable and intentionally neutral, never
 * self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: ROLLBACK_TO_OLD_VERSION_KEY,
    valueEquals: true,
    whenTriggerEquals: { regressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Fully reverted to the previous version",
      explanation:
        "Rolling back returned all traffic to the old version, so the regressed code stopped running for every user immediately. This is the most unconditionally safe containment available, but it also discards whatever genuine improvements the new version shipped, and resuming the rollout later means repeating a full deploy cycle rather than simply flipping a flag or raising a percentage.",
    },
  },
  {
    id: "acr_2",
    controlKey: REGRESSED_FEATURE_ENABLED_KEY,
    valueEquals: false,
    whenTriggerEquals: { regressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Disabled the specific regressed feature",
      explanation:
        "Turning off the one feature responsible for the regression stopped the regressed code path from running while leaving the rest of the new version live at its current rollout share. This recovered just as fully as a rollback once the flag was off, without discarding the new version's other changes or requiring a redeploy — a comparably safe and cheaper containment when the regression really is isolated to one feature.",
    },
  },
  {
    id: "acr_3",
    controlKey: ROLLOUT_PERCENT_KEY,
    valueEquals: 0,
    whenTriggerEquals: { regressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Reduced rollout to zero traffic",
      explanation:
        "Driving the new version's rollout percentage to zero removed live exposure to the regression entirely, reaching the same no-impact outcome as a rollback. The new version stays deployed and can be ramped back up directly without a redeploy, but any rollout percentage above zero would have left some users still hitting the regressed code.",
    },
  },
  {
    id: "acr_4",
    controlKey: ROLLOUT_PERCENT_KEY,
    valueAtLeast: 10,
    valueAtMost: 50,
    whenTriggerEquals: { regressionActive: true },
    outcome: "neutral",
    feedback: {
      title: "Reduced exposure without removing it",
      explanation:
        "Lowering the rollout percentage shrinks how many users hit the regressed version, which is a real and proportional reduction in impact. It is not full containment on its own, though — whatever share of traffic is still routed to the new version continues to experience the elevated error rate and latency.",
    },
  },
  {
    id: "acr_5",
    controlKey: NEW_VERSION_INSTANCE_COUNT_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { regressionActive: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the version that was regressed, not the dependency",
      explanation:
        "Adding new-version instances gave the regression more parallel capacity to run in, which eased per-instance memory pressure but did nothing about the error rate or latency of the regressed code path itself — every instance still runs the same broken logic. Worse, the larger fleet issued more concurrent calls into the shared dependency, pushing it toward saturation faster than leaving instance count alone.",
    },
  },
  {
    id: "acr_6",
    controlKey: DEPENDENCY_PROTECTION_MODE_KEY,
    valueEquals: "circuit-breaker",
    whenTriggerEquals: { regressionActive: true },
    outcome: "neutral",
    feedback: {
      title: "Protected the shared dependency, not the new version",
      explanation:
        "A circuit breaker in front of the shared dependency meaningfully reduced how much regressed-feature load reached it, protecting the old version's otherwise-healthy traffic from cross-contamination. The new version's own error rate and latency stayed elevated, though — this contains the secondary consequence without touching the regression.",
    },
  },
  {
    id: "acr_7",
    controlKey: DEPENDENCY_PROTECTION_MODE_KEY,
    valueEquals: "rate-limit",
    whenTriggerEquals: { regressionActive: true },
    outcome: "neutral",
    feedback: {
      title: "Partially throttled load into the shared dependency",
      explanation:
        "Rate limiting bounded some of the regressed-feature call volume reaching the shared dependency, offering lighter protection than a circuit breaker while still letting a meaningful share through. The new version's own regression was unaffected either way.",
    },
  },
  {
    id: "acr_8",
    controlKey: TRAFFIC_ROUTING_MODE_KEY,
    valueEquals: "isolated-pool",
    whenTriggerEquals: { regressionActive: true },
    outcome: "neutral",
    feedback: {
      title: "Isolated the blast radius without stopping it",
      explanation:
        "Routing the new version's dependency calls through a separate connection pool kept the old version's traffic from sharing in the saturation once the shared dependency came under pressure. It is a real structural safeguard against cross-contamination, but the new version's own regression kept running exactly as before.",
    },
  },
];
