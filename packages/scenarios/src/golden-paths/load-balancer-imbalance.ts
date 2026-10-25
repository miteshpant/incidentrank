import type { ScenarioGoldenPath } from "./types";
import { BALANCING_STRATEGY_KEY } from "../load-balancer-imbalance/definition";

const SESSION_SURGE_MS = 30_000;

/**
 * Extracted from load-balancer-imbalance.test.ts's "Finish from optimal ->
 * resolved/optimal" (switching the balancing strategy to least-connections)
 * — tier optimal.
 */
export const loadBalancerImbalanceGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "load-balancer-imbalance",
  actions: [
    {
      atMs: SESSION_SURGE_MS + 1_000,
      controlKey: BALANCING_STRATEGY_KEY,
      value: "leastConnections",
    },
  ],
  finishAtMs: SESSION_SURGE_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
