import type { ScenarioGoldenPath } from "./types";
import {
  DB_POOL_MAX_SIZE_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_POOL_CONFIG_KEY,
} from "../connection-pool-starvation/definition";

const POOL_STARVES_MS = 45_000;

/**
 * Extracted from connection-pool-starvation.test.ts's "investigating
 * deploy history, then pool config, then fixing — reaches the
 * correlated path" — the scenario's own authored strong path.
 * definition.ts's completion has no acceptableCondition authored, so the
 * resolved outcome is automatically tier optimal.
 */
export const connectionPoolStarvationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "connection-pool-starvation",
  actions: [
    { atMs: POOL_STARVES_MS + 1_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
    { atMs: POOL_STARVES_MS + 2_000, controlKey: INSPECT_POOL_CONFIG_KEY, value: true },
    { atMs: POOL_STARVES_MS + 3_000, controlKey: DB_POOL_MAX_SIZE_KEY, value: 100 },
  ],
  finishAtMs: POOL_STARVES_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
