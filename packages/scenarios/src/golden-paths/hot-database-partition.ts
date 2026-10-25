import type { ScenarioGoldenPath } from "./types";
import { PARTITIONING_STRATEGY_KEY } from "../hot-database-partition/definition";

/**
 * Extracted from hot-database-partition.test.ts's "Phase 6.1: three-tier
 * completion" -> "Finish from optimal -> resolved/optimal" (salted-hash
 * re-keying strong path), tier optimal.
 */
export const hotDatabasePartitionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "hot-database-partition",
  actions: [{ atMs: 31_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "saltedHash" }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
