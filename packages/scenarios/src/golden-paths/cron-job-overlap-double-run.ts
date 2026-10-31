import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_JOB_RUN_HISTORY_KEY,
  INSPECT_SOURCE_TABLE_GROWTH_KEY,
  INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
  JOB_CONCURRENCY_GUARD_ENABLED_KEY,
} from "../cron-job-overlap-double-run/definition";

const OVERLAP_BEGINS_MS = 30_000;

/**
 * Extracted from cron-job-overlap-double-run.test.ts's "investigating
 * run history, then source growth, then row counts, then fixing —
 * reaches the correlated path" — the scenario's own authored strong
 * path. definition.ts's completion has no acceptableCondition authored,
 * so the resolved outcome is automatically tier optimal.
 */
export const cronJobOverlapDoubleRunGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cron-job-overlap-double-run",
  actions: [
    { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: INSPECT_JOB_RUN_HISTORY_KEY, value: true },
    { atMs: OVERLAP_BEGINS_MS + 2_000, controlKey: INSPECT_SOURCE_TABLE_GROWTH_KEY, value: true },
    { atMs: OVERLAP_BEGINS_MS + 3_000, controlKey: INSPECT_DAILY_METRICS_ROW_COUNTS_KEY, value: true },
    { atMs: OVERLAP_BEGINS_MS + 4_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
  ],
  finishAtMs: OVERLAP_BEGINS_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
