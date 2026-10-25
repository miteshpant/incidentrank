import type { ScenarioGoldenPath } from "./types";
import {
  IDEMPOTENCY_KEY_HANDLING_KEY,
  TRANSACTION_HANDLING_KEY,
} from "../duplicate-request-processing/definition";

/**
 * Extracted from duplicate-request-processing.test.ts's "the
 * fully-deduplicated state is eligible for an OPTIMAL-tier Finish" /
 * "Finish from optimal -> resolved/optimal" test case (enforced
 * idempotency + atomic transactions, without raising client retry
 * count) — asserted resolved/optimal via evaluateCandidateDeclaredFinish.
 * No acceptableCondition is authored for this scenario.
 */
export const duplicateRequestProcessingGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "duplicate-request-processing",
  actions: [
    { atMs: 31_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
    { atMs: 31_000, controlKey: TRANSACTION_HANDLING_KEY, value: "atomic" },
  ],
  finishAtMs: 55_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
