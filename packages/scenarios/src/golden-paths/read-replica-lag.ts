import type { ScenarioGoldenPath } from "./types";
import { READ_ROUTING_MODE_KEY } from "../read-replica-lag/definition";

/**
 * Extracted from read-replica-lag.test.ts's "recovers when reads are
 * routed to the primary for recent writes" case. This scenario has no
 * authored acceptableCondition, so the only tier evaluateCandidateDeclared
 * Finish can ever return for a resolved outcome is "optimal".
 */
export const readReplicaLagGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "read-replica-lag",
  actions: [
    { atMs: 31_000, controlKey: READ_ROUTING_MODE_KEY, value: "primary-for-recent-writes" },
  ],
  finishAtMs: 55_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
