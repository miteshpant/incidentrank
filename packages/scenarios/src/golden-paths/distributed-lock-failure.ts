import type { ScenarioGoldenPath } from "./types";
import { FENCING_TOKEN_ENABLED_KEY } from "../distributed-lock-failure/definition";

/**
 * Extracted from distributed-lock-failure.test.ts's "strong path: fencing
 * enabled stays safe (zero correctness violations)" — asserted
 * resolved/optimal via evaluateCandidateDeclaredFinish in the "Finish
 * from fenced -> resolved/optimal" test case. No acceptableCondition is
 * authored for this scenario (single-tier candidate_declared).
 */
export const distributedLockFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "distributed-lock-failure",
  actions: [{ atMs: 31_000, controlKey: FENCING_TOKEN_ENABLED_KEY, value: true }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
