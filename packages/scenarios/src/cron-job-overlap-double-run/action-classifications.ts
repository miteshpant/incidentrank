import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CRON_INTERVAL_MINUTES_KEY,
  INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
  INSPECT_JOB_RUN_HISTORY_KEY,
  INSPECT_SOURCE_TABLE_GROWTH_KEY,
  JOB_CONCURRENCY_GUARD_ENABLED_KEY,
  JOB_WORKER_COUNT_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_JOB_RUN_HISTORY_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_SOURCE_TABLE_GROWTH_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_DAILY_METRICS_ROW_COUNTS_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { jobOverlapping: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: job-level concurrency guard",
      explanation:
        "The reconciliation job had no skip-if-running / mutual-exclusion guard, so a slow run and the next scheduled fire could execute concurrently and double-write the same rows. Enabling the concurrency guard is the only change that actually prevents two instances from running at once.",
    },
  },
  {
    controlKey: JOB_WORKER_COUNT_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { jobOverlapping: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: adding more job workers",
      explanation:
        "More workers can make a single run finish faster, but nothing stops a second scheduled run from starting while the first is still in progress — the race condition that causes double-writes is untouched.",
    },
  },
  {
    controlKey: CRON_INTERVAL_MINUTES_KEY,
    valueAtLeast: 60,
    whenTriggerEquals: { jobOverlapping: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: widening the schedule interval",
      explanation:
        "A longer interval between scheduled runs makes overlap less frequent, but an unusually slow run can still exceed any fixed interval — this reduces the odds of the incident, it does not close the underlying concurrency gap.",
    },
  },
];
