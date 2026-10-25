import type { ScenarioGoldenPath } from "./types";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  API_TO_A_TIMEOUT_MS_KEY,
  B_TO_C_TIMEOUT_MS_KEY,
} from "../dependency-timeout-cascade/definition";

/**
 * Extracted from dependency-timeout-cascade.test.ts's "strong path:
 * re-proportioning the full timeout budget recovers the chain end to
 * end" — asserted resolved/optimal via evaluateCandidateDeclaredFinish
 * in the "Finish from optimal -> resolved/optimal" test case.
 */
export const dependencyTimeoutCascadeGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "dependency-timeout-cascade",
  actions: [
    { atMs: 31_000, controlKey: B_TO_C_TIMEOUT_MS_KEY, value: 800 },
    { atMs: 31_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_000 },
    { atMs: 31_000, controlKey: API_TO_A_TIMEOUT_MS_KEY, value: 1_500 },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
