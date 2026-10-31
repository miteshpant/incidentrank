import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance `investigation*Done` state keys, which the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts). Same
// convention as the reference incident's investigation controls.
export const INSPECT_JOB_RUN_HISTORY_KEY = "inspectJobRunHistory";
export const INSPECT_SOURCE_TABLE_GROWTH_KEY = "inspectSourceTableGrowth";
export const INSPECT_DAILY_METRICS_ROW_COUNTS_KEY = "inspectDailyMetricsRowCounts";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The real root cause: the job has no mutual-exclusion guard, so a slow
// run and the next scheduled run execute concurrently. Enabling this is
// the only control that actually prevents overlap.
export const JOB_CONCURRENCY_GUARD_ENABLED_KEY = "jobConcurrencyGuardEnabled";

// Plausible-but-inferior path A: throwing more parallel workers at the
// job makes a SINGLE run finish faster, which narrows the overlap window
// but never closes it — a long enough source-table scan still overruns
// the next scheduled fire, and now each overlapping pair also writes
// faster, so double-write pressure on daily-metrics-table can even get
// worse per unit time.
export const JOB_WORKER_COUNT_KEY = "jobWorkerCount";

// Plausible-but-inferior path B: widening the schedule interval reduces
// how often overlap CAN occur, but does nothing to prevent it when a
// run is unusually slow (e.g. a bigger-than-normal day's source data) —
// it just makes the incident rarer, not impossible, and it is the
// control most likely to be reached for first because it looks like the
// "obvious" fix ("the job runs too often, so run it less often").
export const CRON_INTERVAL_MINUTES_KEY = "cronIntervalMinutes";

export const controls: ControlDefinition[] = [
  { key: INSPECT_JOB_RUN_HISTORY_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_SOURCE_TABLE_GROWTH_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_DAILY_METRICS_ROW_COUNTS_KEY, allowedValues: [false, true], initialValue: false },
  { key: JOB_CONCURRENCY_GUARD_ENABLED_KEY, allowedValues: [false, true], initialValue: false },
  { key: JOB_WORKER_COUNT_KEY, allowedValues: [4, 8, 16, 32], initialValue: 4 },
  { key: CRON_INTERVAL_MINUTES_KEY, allowedValues: [30, 60, 120], initialValue: 30 },
];
