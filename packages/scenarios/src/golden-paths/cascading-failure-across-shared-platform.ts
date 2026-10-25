import type { ScenarioGoldenPath } from "./types";
import {
  ASYNC_WORKER_CONCURRENCY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  IDENTITY_CIRCUIT_BREAKER_KEY,
  PRODUCT_B_ISOLATION_KEY,
  RESTORATION_ORDER_KEY,
} from "../cascading-failure-across-shared-platform/definition";

const IDENTITY_DEGRADED_MS = 20_000;
const AMPLIFICATION_COMPOUNDED_MS = IDENTITY_DEGRADED_MS + 60_000;
const STARVATION_COMPOUNDED_MS = AMPLIFICATION_COMPOUNDED_MS + 60_000;
const SUSTAINED_CASCADE_MS = STARVATION_COMPOUNDED_MS + 90_000;
const DB_DRAIN_WINDOW_1_MS = SUSTAINED_CASCADE_MS + 60_000;
const MSG_FULLY_DRAINED_MS = SUSTAINED_CASCADE_MS + 6 * 60_000;

/**
 * Extracted from cascading-failure-across-shared-platform.test.ts's
 * "declares resolved at the OPTIMAL tier once the full safe path is
 * complete" (SAFE_FULL_ISOLATION_ACTIONS) — this scenario has an authored
 * acceptableCondition (acceptable-drained-isolated), and this full
 * isolate-then-restore-root-first sequence is explicitly asserted to reach
 * completionTier "optimal".
 */
export const cascadingFailureAcrossSharedPlatformGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cascading-failure-across-shared-platform",
  actions: [
    { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_ISOLATION_KEY, value: "isolated" },
    { atMs: STARVATION_COMPOUNDED_MS + 2_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
    { atMs: STARVATION_COMPOUNDED_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
    { atMs: DB_DRAIN_WINDOW_1_MS + 1_000, controlKey: ASYNC_WORKER_CONCURRENCY_KEY, value: "scaled" },
    {
      atMs: MSG_FULLY_DRAINED_MS + 1_000,
      controlKey: RESTORATION_ORDER_KEY,
      value: "root-first",
    },
  ],
  finishAtMs: MSG_FULLY_DRAINED_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
