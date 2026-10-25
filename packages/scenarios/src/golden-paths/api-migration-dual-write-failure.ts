import type { ScenarioGoldenPath } from "./types";
import {
  MIGRATION_DIRECTION_KEY,
  READ_SOURCE_KEY,
  RECONCILIATION_MODE_KEY,
  WRITE_MODE_KEY,
} from "../api-migration-dual-write-failure/definition";

/**
 * Extracted from api-migration-dual-write-failure.test.ts's "optimal path
 * (freeze + fully reconcile + declare rollback-legacy) scores at or near
 * the top" (SAFE_FREEZE_AND_RECONCILE_LEGACY_ACTIONS) — freezes writes to
 * legacy-only, reads from legacy, reconciles via diff-and-repair, then
 * declares rollback-legacy once reconciliation has fully drained.
 * Asserted resolved/optimal via evaluateCandidateDeclaredFinish.
 */
export const apiMigrationDualWriteFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "api-migration-dual-write-failure",
  actions: [
    { atMs: 21_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
    { atMs: 22_000, controlKey: READ_SOURCE_KEY, value: "legacy" },
    { atMs: 23_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
    { atMs: 321_000, controlKey: MIGRATION_DIRECTION_KEY, value: "rollback-legacy" },
  ],
  finishAtMs: 355_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
