import type { ScenarioGoldenPath } from "./types";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
  GATEWAY_TO_A_TIMEOUT_MS_KEY,
  REQUEST_CANCELLATION_ENABLED_KEY,
} from "../request-timeout-cascade/definition";

/**
 * Extracted from request-timeout-cascade.test.ts's "Finish from optimal
 * -> resolved/optimal" case (FULL_REBUDGET_ACTIONS: re-proportioning the
 * full timeout budget across all three hops plus enabling request
 * cancellation) — recovers the chain end to end.
 */
export const requestTimeoutCascadeGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "request-timeout-cascade",
  actions: [
    { atMs: 31_000, controlKey: B_TO_DEPENDENCY_TIMEOUT_MS_KEY, value: 900 },
    { atMs: 31_000, controlKey: A_TO_B_TIMEOUT_MS_KEY, value: 1_200 },
    { atMs: 31_000, controlKey: GATEWAY_TO_A_TIMEOUT_MS_KEY, value: 1_800 },
    { atMs: 31_000, controlKey: REQUEST_CANCELLATION_ENABLED_KEY, value: true },
  ],
  finishAtMs: 70_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
