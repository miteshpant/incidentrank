import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CRON_INTERVAL_MINUTES_KEY,
  INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
  INSPECT_JOB_RUN_HISTORY_KEY,
  INSPECT_SOURCE_TABLE_GROWTH_KEY,
  JOB_CONCURRENCY_GUARD_ENABLED_KEY,
  JOB_WORKER_COUNT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "cron-scheduler": "healthy",
  "reconciliation-job": "healthy",
  "source-orders-table": "healthy",
  "daily-metrics-table": "healthy",
};

const overlappingHealth: Record<string, ComponentHealth> = {
  "cron-scheduler": "degraded",
  "reconciliation-job": "critical",
  "source-orders-table": "healthy",
  "daily-metrics-table": "critical",
};

const stillOverlappingHealth: Record<string, ComponentHealth> = {
  "cron-scheduler": "degraded",
  "reconciliation-job": "degraded",
  "source-orders-table": "healthy",
  "daily-metrics-table": "degraded",
};

/**
 * Authored rule table for the Cron Job Overlap Double-Run incident,
 * ordered most-specific-first per this codebase's existing convention.
 * The real root cause is a missing mutual-exclusion guard on the
 * reconciliation job itself: nothing stops the scheduler from launching
 * a second instance while the first is still running. Source Orders
 * Table stays healthy throughout (it is only read from, never the
 * bottleneck) — the misleading-healthy signal the candidate must notice
 * is NOT where the problem lives. `concurrentRunCount` only drops back
 * to 1, and `dailyMetricsDuplicateRowPercent` only stops climbing, once
 * the concurrency guard is actually enabled — widening the schedule
 * interval or adding workers both look like plausible responses but
 * neither one closes the race.
 *
 * `diagnosisPath` captures what the candidate correlated by the time
 * they applied the fix (investigated run history + source growth +
 * output row counts, vs. enabled the guard on a guess, vs. one of the
 * two inferior single-control remediations), read generically by
 * scoring.ts via the existing finalStringEquals measure, and by the
 * post-incident narrative via roleInIncident-tagged metrics
 * (candidate-ui.ts) — never a bespoke mechanism.
 */
export const overlapRules: Rule[] = [
  // ── Best path: investigated all three signal sources AND enabled the
  // concurrency guard. Overlap stops; duplicate-row growth halts and
  // the job settles back into a single run per schedule tick.
  {
    id: "correlated-then-fixed",
    when: {
      triggerEquals: { jobOverlapping: true },
      controlEquals: {
        [INSPECT_JOB_RUN_HISTORY_KEY]: true,
        [INSPECT_SOURCE_TABLE_GROWTH_KEY]: true,
        [INSPECT_DAILY_METRICS_ROW_COUNTS_KEY]: true,
        [JOB_CONCURRENCY_GUARD_ENABLED_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      jobRunDurationMinutes: 19,
      concurrentRunCount: 1,
      dailyMetricsDuplicateRowPercent: 6,
      dailyMetricsRowCount: 49_200,
      sourceTableScanLatencyMs: 910,
      schedulerMissedFireCount: 3,
      diagnosisPath: "correlated-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without investigating first (e.g. enabled
  // the guard on a guess). The incident still resolves — the fix is the
  // fix — but the candidate never demonstrated they understood why,
  // which is exactly what the investigation-quality scoring dimension
  // penalizes.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { jobOverlapping: true },
      controlEquals: { [JOB_CONCURRENCY_GUARD_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      jobRunDurationMinutes: 19,
      concurrentRunCount: 1,
      dailyMetricsDuplicateRowPercent: 6,
      dailyMetricsRowCount: 49_200,
      sourceTableScanLatencyMs: 910,
      schedulerMissedFireCount: 3,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── Inferior path A: scaled up job worker count only. A single run
  // finishes somewhat faster, but nothing stops a second instance from
  // launching on a slow night — overlap (and the double-writes it
  // causes) continues, now landing faster per overlapping pair.
  {
    id: "scaled-workers-only",
    when: {
      triggerEquals: { jobOverlapping: true },
      controlAtLeast: { [JOB_WORKER_COUNT_KEY]: 8 },
      controlEquals: { [JOB_CONCURRENCY_GUARD_ENABLED_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      jobRunDurationMinutes: 14,
      concurrentRunCount: 2,
      dailyMetricsDuplicateRowPercent: 38,
      dailyMetricsRowCount: 71_000,
      sourceTableScanLatencyMs: 640,
      schedulerMissedFireCount: 9,
      diagnosisPath: "scaled-workers-only",
    },
    componentHealth: stillOverlappingHealth,
  },

  // ── Inferior path B: widened the cron interval only. Overlap becomes
  // less frequent, but a run that is unusually slow (tonight's case)
  // still overruns even a 60- or 120-minute interval, so the race
  // condition itself is never closed — it is only made rarer.
  {
    id: "widened-interval-only",
    when: {
      triggerEquals: { jobOverlapping: true },
      controlAtLeast: { [CRON_INTERVAL_MINUTES_KEY]: 60 },
      controlEquals: { [JOB_CONCURRENCY_GUARD_ENABLED_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      jobRunDurationMinutes: 34,
      concurrentRunCount: 2,
      dailyMetricsDuplicateRowPercent: 31,
      dailyMetricsRowCount: 68_500,
      sourceTableScanLatencyMs: 905,
      schedulerMissedFireCount: 2,
      diagnosisPath: "widened-interval-only",
    },
    componentHealth: stillOverlappingHealth,
  },

  // ── Baseline critical: overlap active, no mitigation applied yet.
  // Source Orders Table is deliberately unaffected — the misleading
  // "the data source must be slow" signal the candidate must rule out.
  {
    id: "overlap-baseline",
    when: { triggerEquals: { jobOverlapping: true } },
    incidentState: "overlapping",
    values: {
      jobRunDurationMinutes: 34,
      concurrentRunCount: 2,
      dailyMetricsDuplicateRowPercent: 42,
      dailyMetricsRowCount: 74_000,
      sourceTableScanLatencyMs: 915,
      schedulerMissedFireCount: 1,
      diagnosisPath: "not-attempted",
    },
    componentHealth: overlappingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      jobRunDurationMinutes: 18,
      concurrentRunCount: 1,
      dailyMetricsDuplicateRowPercent: 0,
      dailyMetricsRowCount: 48_000,
      sourceTableScanLatencyMs: 900,
      schedulerMissedFireCount: 0,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
