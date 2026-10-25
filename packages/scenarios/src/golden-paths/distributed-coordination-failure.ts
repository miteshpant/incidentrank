import type { ScenarioGoldenPath } from "./types";
import {
  OWNERSHIP_FENCING_ENABLED_KEY,
  OWNERSHIP_RECONCILIATION_ENABLED_KEY,
} from "../distributed-coordination-failure/definition";

/**
 * Extracted from distributed-coordination-failure.test.ts's "scores the
 * fully safe reconciled+fenced path highest among all executed paths" —
 * this scenario is authored as `completion: { mode: "automatic" }` with
 * no acceptableCondition (migrated off raw state.status === "resolved"
 * assertions onto evaluateCandidateDeclaredFinish per this phase's
 * automatic-mode test migration). The test explicitly asserts
 * `optimalFinish.outcome === "resolved"` via evaluateCandidateDeclaredFinish
 * before scoring; with no acceptableCondition authored, any resolved
 * outcome is automatically tier "optimal".
 */
export const distributedCoordinationFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "distributed-coordination-failure",
  actions: [
    { atMs: 31_000, controlKey: OWNERSHIP_RECONCILIATION_ENABLED_KEY, value: true },
    { atMs: 31_000, controlKey: OWNERSHIP_FENCING_ENABLED_KEY, value: true },
  ],
  finishAtMs: 65_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
