import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  FORCE_PIN_REGION_KEY,
  HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
  HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
  INSPECT_DNS_FAILOVER_HISTORY_KEY,
  INSPECT_HEALTH_CHECK_LOGS_KEY,
  INSPECT_REGION_LATENCY_HISTORY_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_HEALTH_CHECK_LOGS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_REGION_LATENCY_HISTORY_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_DNS_FAILOVER_HISTORY_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
    valueAtLeast: 3,
    whenTriggerEquals: { latencyBlipsActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix (half): require a consecutive failure streak",
      explanation:
        "Raising the number of consecutive failed probes required before failing over means a single transient latency blip can no longer trip failover on its own.",
    },
  },
  {
    controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
    valueAtLeast: 600,
    whenTriggerEquals: { latencyBlipsActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix (half): loosen the latency tolerance",
      explanation:
        "Raising the latency threshold a probe must exceed to count as a failure means a brief blip no longer registers as a health-check failure at all.",
    },
  },
  {
    controlKey: FORCE_PIN_REGION_KEY,
    valueEquals: true,
    whenTriggerEquals: { latencyBlipsActive: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but risky: force-pinning to one region",
      explanation:
        "Pinning DNS to a single region does stop the flapping you can see, but it does so by disabling automated failover protection entirely rather than fixing the oversensitive health check — a genuine outage in the pinned region later would have no automatic failover at all.",
    },
  },
];
