import type { ScenarioGoldenPath } from "./types";
import {
  CHECKPOINT_CADENCE_KEY,
  DATASET_PRIORITY_KEY,
  PROCESSOR_CONCURRENCY_KEY,
  WAREHOUSE_WRITER_CONCURRENCY_KEY,
} from "../data-pipeline-freshness-collapse/definition";

/**
 * Extracted from data-pipeline-freshness-collapse.test.ts's "Finish from
 * the fully-recovered path -> resolved/optimal" case (SAFE_SCALING_ACTIONS,
 * run until DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000). SUSTAINED_LAG_MS =
 * 200_000 and DRAIN_WINDOW_FULLY_RECOVERED_MS = 740_000 per
 * data-pipeline-freshness-collapse/timed-events.ts.
 */
export const dataPipelineFreshnessCollapseGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "data-pipeline-freshness-collapse",
  actions: [
    { atMs: 201_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
    { atMs: 202_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
    { atMs: 203_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
    { atMs: 204_000, controlKey: DATASET_PRIORITY_KEY, value: "tier1-first" },
  ],
  finishAtMs: 775_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
