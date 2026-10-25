import type { ScenarioGoldenPath } from "./types";
import { KEY_REPLICATION_ENABLED_KEY } from "../hot-key-cache-overload/definition";

const HOT_KEY_SPIKE_MS = 30_000;

/**
 * Extracted from hot-key-cache-overload.test.ts's "Finish from optimal ->
 * resolved/optimal" (enabling key replication — a targeted fix) — tier
 * optimal.
 */
export const hotKeyCacheOverloadGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "hot-key-cache-overload",
  actions: [
    { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: KEY_REPLICATION_ENABLED_KEY, value: true },
  ],
  finishAtMs: HOT_KEY_SPIKE_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
