import type { ScenarioGoldenPath } from "./types";
import { CUTOVER_STRATEGY_KEY } from "../data-lineage-break-during-etl-migration/definition";

/**
 * Extracted from data-lineage-break-during-etl-migration.test.ts's
 * "Scoring" -> "optimal path (staged-per-source, fully complete) scores
 * near-maximum with full dataIntegrity credit" case (STAGED_ONLY_ACTIONS,
 * run until CUTOVER_FULLY_COMPLETE_MS + 35_000). SUSTAINED_UNDECIDED_MS =
 * 200_000 and CUTOVER_FULLY_COMPLETE_MS = 620_000 per
 * data-lineage-break-during-etl-migration/timed-events.ts.
 */
export const dataLineageBreakDuringEtlMigrationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "data-lineage-break-during-etl-migration",
  actions: [{ atMs: 201_000, controlKey: CUTOVER_STRATEGY_KEY, value: "staged-per-source" }],
  finishAtMs: 655_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
