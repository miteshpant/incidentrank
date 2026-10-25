import type { ScenarioGoldenPath } from "./types";
import { TRANSACTION_LOCK_ORDERING_KEY } from "../deadlock-storm/definition";

/**
 * Extracted from deadlock-storm.test.ts's "strong path: canonical lock
 * ordering removes deadlocks entirely" — asserted resolved/optimal via
 * evaluateCandidateDeclaredFinish in the "Finish from the optimal state
 * resolves with completionTier=optimal" test case.
 */
export const deadlockStormGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "deadlock-storm",
  actions: [{ atMs: 31_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
