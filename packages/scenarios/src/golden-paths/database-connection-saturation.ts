import type { ScenarioGoldenPath } from "./types";
import { POOL_SIZE_KEY, READ_REPLICA_ENABLED_KEY } from "../db-connection-saturation/definition";

/**
 * Extracted from db-connection-saturation.test.ts's "good" case in
 * "orders good > partial > baseline > harmful" (the "scaled-pool-with-
 * replica" rule) — pool scaled to >= 100 AND the read replica enabled
 * reaches `recovering`, genuinely satisfying and sustaining
 * successCondition. database-connection-saturation has no
 * acceptableCondition, so the resolved outcome is automatically tier
 * optimal. Note: the scenario's content directory on disk is
 * `db-connection-saturation` (short prefix) even though its scenario
 * slug is the full `database-connection-saturation`.
 */
export const databaseConnectionSaturationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "database-connection-saturation",
  actions: [
    { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
    { atMs: 31_000, controlKey: READ_REPLICA_ENABLED_KEY, value: true },
  ],
  finishAtMs: 60_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
