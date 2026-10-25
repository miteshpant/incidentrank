import type { ScenarioGoldenPath } from "./types";
import {
  BACKFILL_CONCURRENCY_KEY,
  COMPATIBILITY_WRITE_MODE_KEY,
  ROLLBACK_APP_FLEET_KEY,
} from "../schema-migration-under-live-traffic/definition";

/**
 * Extracted from schema-migration-under-live-traffic.test.ts's
 * "alternate strong path A: dual-shape + backfill + roll back cleanly --
 * reaches OPTIMAL" case (SAFE_DUAL_SHAPE_AND_BACKFILL_ROLLBACK_ACTIONS):
 * stop creating incompatible rows first (dual-shape), run backfill at
 * low concurrency, then roll the app fleet back once the backfill
 * window has fully elapsed -- the correct safety-respecting sequence.
 */
export const schemaMigrationUnderLiveTrafficGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "schema-migration-under-live-traffic",
  actions: [
    { atMs: 21_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
    { atMs: 22_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "low" },
    { atMs: 321_000, controlKey: ROLLBACK_APP_FLEET_KEY, value: true },
  ],
  finishAtMs: 360_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
