import type { ScenarioGoldenPath } from "./types";
import { CACHE_BEHAVIOR_KEY } from "../api-traffic-spike/definition";

/**
 * Extracted from api-traffic-spike.test.ts's "Finish from optimal ->
 * resolved/optimal" — extends cache TTL during the traffic spike.
 * Asserted resolved/optimal via evaluateCandidateDeclaredFinish.
 */
export const apiTrafficSpikeGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "api-traffic-spike",
  actions: [{ atMs: 31_000, controlKey: CACHE_BEHAVIOR_KEY, value: "extendedTtl" }],
  finishAtMs: 70_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
