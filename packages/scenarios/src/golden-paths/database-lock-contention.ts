import type { ScenarioGoldenPath } from "./types";
import {
  BATCH_JOB_CHUNK_SIZE_KEY,
  BATCH_JOB_CONCURRENCY_KEY,
} from "../database-lock-contention/definition";

/**
 * Extracted from database-lock-contention.test.ts's "goodActions" case
 * (smaller batch chunks + lower concurrency) — database-lock-contention
 * has no acceptableCondition, so the resolved outcome is automatically
 * tier optimal.
 */
export const databaseLockContentionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "database-lock-contention",
  actions: [
    { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 100 },
    { atMs: 31_000, controlKey: BATCH_JOB_CONCURRENCY_KEY, value: 2 },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
