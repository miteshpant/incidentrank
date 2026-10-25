import type { ScenarioGoldenPath } from "./types";
import { BALANCE_CONSISTENCY_MODE_KEY } from "../consistency-vs-availability-incident/definition";

/**
 * Extracted from consistency-vs-availability-incident.test.ts's "Finish
 * from the differentiated Strategy B -> resolved/optimal" case.
 * consistency-vs-availability-incident has no acceptableCondition, so
 * the resolved outcome is automatically tier optimal.
 */
export const consistencyVsAvailabilityIncidentGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "consistency-vs-availability-incident",
  actions: [{ atMs: 31_000, controlKey: BALANCE_CONSISTENCY_MODE_KEY, value: "strong" }],
  finishAtMs: 70_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
