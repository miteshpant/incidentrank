import type { ScenarioGoldenPath } from "./types";
import { TARGETED_INDEX_ENABLED_KEY } from "../missing-database-index/definition";

const TRAFFIC_RISING_MS = 30_000;

/**
 * Extracted from missing-database-index.test.ts's "Finish from optimal ->
 * resolved/optimal" case (strong path: enabling the targeted index).
 */
export const missingDatabaseIndexGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "missing-database-index",
  actions: [
    { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: TARGETED_INDEX_ENABLED_KEY, value: true },
  ],
  finishAtMs: TRAFFIC_RISING_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
