import type { ScenarioGoldenPath } from "./types";
import { ELECTION_TIMEOUT_MS_KEY } from "../leader-election-storm/definition";

const JITTER_STARTS_MS = 30_000;

/**
 * Extracted from leader-election-storm.test.ts's "Finish from optimal ->
 * resolved/optimal" (raising the election timeout — margin-fixed) — tier
 * optimal.
 */
export const leaderElectionStormGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "leader-election-storm",
  actions: [
    { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
  ],
  finishAtMs: JITTER_STARTS_MS + 25_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
