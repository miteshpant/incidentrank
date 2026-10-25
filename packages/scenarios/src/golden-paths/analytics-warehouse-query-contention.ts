import type { ScenarioGoldenPath } from "./types";
import { ADMISSION_POLICY_KEY } from "../analytics-warehouse-query-contention/definition";

/**
 * Extracted from analytics-warehouse-query-contention.test.ts's "reaches
 * genuine OPTIMAL once the full drain window elapses" (alternate strong
 * path A: priority-queue admission alone). Asserted resolved/optimal via
 * evaluateCandidateDeclaredFinish.
 */
export const analyticsWarehouseQueryContentionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "analytics-warehouse-query-contention",
  actions: [{ atMs: 141_000, controlKey: ADMISSION_POLICY_KEY, value: "priority-queue" }],
  finishAtMs: 415_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
