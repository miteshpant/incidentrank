import type { ScenarioGoldenPath } from "./types";
import {
  KEY_SCOPE_KEY,
  KEY_TTL_SECONDS_KEY,
  STORAGE_MODE_KEY,
  STORE_UNAVAILABLE_BEHAVIOR_KEY,
} from "../idempotency-failure/definition";

const STORE_DEGRADING_MS = 30_000;

/**
 * Extracted from idempotency-failure.test.ts's "Finish from optimal ->
 * resolved/optimal" (replicated idempotency-key storage, bounded TTL,
 * request-scoped keys, fail-closed under outage — deduplicated) — tier
 * optimal.
 */
export const idempotencyFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "idempotency-failure",
  actions: [
    { atMs: STORE_DEGRADING_MS + 1_000, controlKey: STORAGE_MODE_KEY, value: "replicated" },
    { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_TTL_SECONDS_KEY, value: 300 },
    { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "request-scoped" },
    {
      atMs: STORE_DEGRADING_MS + 1_000,
      controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
      value: "fail-closed",
    },
  ],
  finishAtMs: STORE_DEGRADING_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
