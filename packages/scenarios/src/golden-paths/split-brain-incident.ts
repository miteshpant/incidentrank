import type { ScenarioGoldenPath } from "./types";
import { QUORUM_REQUIREMENT_KEY } from "../split-brain-incident/definition";

/**
 * Extracted from split-brain-incident.test.ts's "Finish from
 * quorum-enforced -> resolved/optimal" — explicitly asserts
 * outcome "resolved" and completionTier "optimal".
 */
export const splitBrainIncidentGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "split-brain-incident",
  actions: [{ atMs: 31_000, controlKey: QUORUM_REQUIREMENT_KEY, value: "majority" }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
