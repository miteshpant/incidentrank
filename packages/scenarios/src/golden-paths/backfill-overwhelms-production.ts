import type { ScenarioGoldenPath } from "./types";
import {
  BACKFILL_CHUNK_SIZE_KEY,
  BACKFILL_CONCURRENCY_KEY,
  DB_PRIORITY_MODE_KEY,
  QUEUE_DISPATCH_RATE_KEY,
} from "../backfill-overwhelms-production/definition";

/**
 * Extracted from backfill-overwhelms-production.test.ts's "Finish from
 * the fully-resumed-complete path -> resolved/optimal"
 * (SAFE_RESHAPE_ACTIONS) — shrinks backfill chunk size, prioritizes live
 * traffic at the DB, throttles queue dispatch, then raises backfill
 * concurrency once production is protected. Asserted resolved/optimal
 * via evaluateCandidateDeclaredFinish.
 */
export const backfillOverwhelmsProductionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "backfill-overwhelms-production",
  actions: [
    { atMs: 201_000, controlKey: BACKFILL_CHUNK_SIZE_KEY, value: "small" },
    { atMs: 202_000, controlKey: DB_PRIORITY_MODE_KEY, value: "live-traffic-first" },
    { atMs: 203_000, controlKey: QUEUE_DISPATCH_RATE_KEY, value: "throttled" },
    { atMs: 204_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
  ],
  finishAtMs: 1_495_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
