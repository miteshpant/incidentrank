import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_WORKER_LOGS_KEY,
  INSPECT_DEPLOY_DIFF_KEY,
  INSPECT_QUEUE_DEPTH_KEY,
  ROLLBACK_WORKER_DEPLOY_KEY,
  WORKER_CONCURRENCY_KEY,
} from "../orphaned-background-worker-queue-growth/definition";

const DEPLOY_BREAKS_WORKERS_MS = 30_000;

/**
 * Extracted from orphaned-background-worker-queue-growth.test.ts's
 * "investigating all three sources, then rolling back the deploy, then
 * raising concurrency — reaches the best diagnosisPath" — the scenario's
 * own authored strong path, completing both independent tracks (fix the
 * deploy, drain the backlog) after investigating all three signal
 * sources. definition.ts's completion has no acceptableCondition
 * authored, so the resolved outcome is automatically tier optimal.
 */
export const orphanedBackgroundWorkerQueueGrowthGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "orphaned-background-worker-queue-growth",
  actions: [
    { atMs: DEPLOY_BREAKS_WORKERS_MS + 1_000, controlKey: INSPECT_WORKER_LOGS_KEY, value: true },
    { atMs: DEPLOY_BREAKS_WORKERS_MS + 2_000, controlKey: INSPECT_DEPLOY_DIFF_KEY, value: true },
    { atMs: DEPLOY_BREAKS_WORKERS_MS + 3_000, controlKey: INSPECT_QUEUE_DEPTH_KEY, value: true },
    { atMs: DEPLOY_BREAKS_WORKERS_MS + 4_000, controlKey: ROLLBACK_WORKER_DEPLOY_KEY, value: true },
    { atMs: DEPLOY_BREAKS_WORKERS_MS + 5_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
  ],
  finishAtMs: DEPLOY_BREAKS_WORKERS_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
