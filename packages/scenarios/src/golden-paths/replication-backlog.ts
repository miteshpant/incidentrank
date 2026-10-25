import type { ScenarioGoldenPath } from "./types";
import { WRITE_THROTTLE_LEVEL_KEY } from "../replication-backlog/definition";

/**
 * Extracted from replication-backlog.test.ts's "Finish from optimal
 * (throttled) -> resolved/optimal" case (aggressive write throttling).
 * This scenario has no authored acceptableCondition, so the only tier a
 * resolved outcome can carry is "optimal".
 */
export const replicationBacklogGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "replication-backlog",
  actions: [
    { atMs: 31_000, controlKey: WRITE_THROTTLE_LEVEL_KEY, value: "aggressive" },
  ],
  finishAtMs: 70_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
