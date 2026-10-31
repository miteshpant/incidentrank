import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_AZ_A_VOLUME_HEALTH_KEY,
  INSPECT_MIGRATION_RETRY_LOGS_KEY,
  INSPECT_AZ_C_SATURATION_KEY,
  PAUSE_MIGRATION_KEY,
  FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
} from "../multi-az-storage-failure-during-migration/definition";

const CASCADE_BEGINS_MS = 75_000;

/**
 * Extracted from multi-az-storage-failure-during-migration.test.ts's
 * "investigating AZ-A, then migration logs, then AZ-C, then fixing —
 * reaches the correlated path" — the scenario's own authored strong
 * path. definition.ts's completion has no acceptableCondition authored,
 * so the resolved outcome is automatically tier optimal.
 */
export const multiAzStorageFailureDuringMigrationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "multi-az-storage-failure-during-migration",
  actions: [
    { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: INSPECT_AZ_A_VOLUME_HEALTH_KEY, value: true },
    { atMs: CASCADE_BEGINS_MS + 2_000, controlKey: INSPECT_MIGRATION_RETRY_LOGS_KEY, value: true },
    { atMs: CASCADE_BEGINS_MS + 3_000, controlKey: INSPECT_AZ_C_SATURATION_KEY, value: true },
    { atMs: CASCADE_BEGINS_MS + 4_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
    { atMs: CASCADE_BEGINS_MS + 5_000, controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY, value: 50 },
  ],
  finishAtMs: CASCADE_BEGINS_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
