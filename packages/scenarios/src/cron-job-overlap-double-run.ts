import type { ScenarioDefinition } from "./types";
import {
  cronJobOverlapDoubleRunSimulation,
  INSPECT_JOB_RUN_HISTORY_KEY,
  INSPECT_SOURCE_TABLE_GROWTH_KEY,
  INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
  JOB_CONCURRENCY_GUARD_ENABLED_KEY,
  JOB_WORKER_COUNT_KEY,
  CRON_INTERVAL_MINUTES_KEY,
} from "./cron-job-overlap-double-run/definition";
import { cronJobOverlapDoubleRunCandidateUI } from "./cron-job-overlap-double-run/candidate-ui";
import { CRON_JOB_OVERLAP_DOUBLE_RUN_SCORING } from "./cron-job-overlap-double-run/scoring";

/**
 * Cron Job Overlap Double-Run — a paid IncidentRank scenario. A nightly
 * batch reconciliation job reads from the source orders table and writes
 * aggregated rows into the daily metrics table on a fixed cron schedule.
 * Source order volume has grown steadily, and tonight the job's own run
 * duration has, for the first time, exceeded the schedule interval — the
 * next scheduled fire launches a second instance before the first has
 * finished. Nothing in the job's own design stops this: there is no
 * skip-if-running guard or mutual-exclusion lock, so the two overlapping
 * runs independently read overlapping source rows and independently
 * write their own aggregated output, double-writing (and in places
 * triple-writing) the daily metrics table. The source orders table
 * itself stays healthy throughout — it is only ever read from — which is
 * the misleading signal: the problem is not that reads are slow, it is
 * that nothing prevents two writers from running at once. The candidate
 * must recognize this as a scheduling/concurrency-control failure and
 * add the missing guard, rather than scaling up workers (which only
 * narrows, but never closes, the overlap window) or widening the
 * schedule interval (which only makes overlap rarer, not impossible).
 */
export const cronJobOverlapDoubleRun: ScenarioDefinition = {
  id: "cron-job-overlap-double-run",
  slug: "cron-job-overlap-double-run",
  version: 1,
  name: "Cron Job Overlap Double-Run",
  description:
    "A nightly batch reconciliation job writes aggregated rows into the daily metrics table on a fixed cron schedule. Tonight, for the first time, the job's own run duration has exceeded its schedule interval — the next scheduled run fired while the previous one was still in progress. The job has no skip-if-running guard, so both instances are now reading overlapping source data and independently writing aggregated output, double-writing the same rows in the daily metrics table. The source orders table itself looks completely healthy — the problem isn't that reads are slow, it's that nothing stops two writers from running at once. Diagnose the missing concurrency control and bring the job back to writing each day's data exactly once.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: cronJobOverlapDoubleRunSimulation,
  library: {
    category: "Data Pipelines",
    tags: ["Cron", "Scheduling", "Concurrency Control", "Idempotency", "Batch Jobs"],
    primarySkill: "Diagnosing a missing scheduling concurrency guard",
    skills: [
      "Recognizing overlapping scheduled job runs as a concurrency-control gap, not a performance problem",
      "Distinguishing a slow read path from a missing mutual-exclusion guard",
      "Recognizing that scaling workers or widening the schedule interval only reduces overlap frequency, not possibility",
      "Verifying that output data is written exactly once per scheduled window before handing back",
    ],
    shortDescription:
      "A nightly batch job's run duration outgrows its own schedule interval, so two instances run at once and double-write the same output rows — the fix is a missing concurrency guard, not more compute.",
  },
};

export {
  cronJobOverlapDoubleRunSimulation,
  cronJobOverlapDoubleRunCandidateUI,
  CRON_JOB_OVERLAP_DOUBLE_RUN_SCORING,
  INSPECT_JOB_RUN_HISTORY_KEY,
  INSPECT_SOURCE_TABLE_GROWTH_KEY,
  INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
  JOB_CONCURRENCY_GUARD_ENABLED_KEY,
  JOB_WORKER_COUNT_KEY,
  CRON_INTERVAL_MINUTES_KEY,
};
