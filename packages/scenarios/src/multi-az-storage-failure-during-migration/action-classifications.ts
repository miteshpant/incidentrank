import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
  INSPECT_AZ_A_VOLUME_HEALTH_KEY,
  INSPECT_AZ_C_SATURATION_KEY,
  INSPECT_MIGRATION_RETRY_LOGS_KEY,
  PAUSE_MIGRATION_KEY,
  RESTART_AZ_A_VOLUMES_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_AZ_A_VOLUME_HEALTH_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_MIGRATION_RETRY_LOGS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_AZ_C_SATURATION_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: PAUSE_MIGRATION_KEY,
    valueEquals: true,
    whenTriggerEquals: { cascadeToAzC: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix (part 1): pausing the migration retry storm",
      explanation:
        "The migration controller's own retry logic was re-targeting AZ-C for every failed AZ-A copy attempt. Pausing the migration stops the retry amplification at its source.",
    },
  },
  {
    controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
    valueAtLeast: 50,
    whenTriggerEquals: { cascadeToAzC: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix (part 2): a controlled failover of live traffic to AZ-C",
      explanation:
        "Moving live read/write traffic off the degraded AZ-A and onto AZ-C at a controlled rate relieves customer impact without dumping the full load onto AZ-C at once.",
    },
  },
  {
    controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
    valueAtLeast: 100,
    whenTriggerEquals: { cascadeToAzC: true },
    outcome: "harmful",
    feedback: {
      title: "Harmful: failing 100% of traffic to AZ-C without stopping the migration retries first",
      explanation:
        "Sending all live traffic to AZ-C while the migration controller is still hammering it with retries doubles AZ-C's load instead of relieving the cascade — the retry storm must be stopped first.",
    },
  },
  {
    controlKey: RESTART_AZ_A_VOLUMES_KEY,
    valueEquals: true,
    whenTriggerEquals: { cascadeToAzC: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting AZ-A's volumes",
      explanation:
        "AZ-A's degradation is a hardware/infrastructure-level I/O problem, not a process that a restart can repair. The migration controller keeps retrying against AZ-A regardless, so the cascade onto AZ-C continues.",
    },
  },
];
