import type { ScenarioGoldenPath } from "./types";
import {
  EU_INVALIDATION_REPLAY_MODE_KEY,
  REGIONAL_INVALIDATOR_ISOLATION_KEY,
  US_CACHE_MODE_KEY,
} from "../cache-invalidation-across-regions/definition";

const INCIDENT_ONSET_MS = 20_000;
const SUSTAINED_DESYNC_MS = INCIDENT_ONSET_MS + 4 * 60_000;
const RECOVERY_WINDOW_FULL_MS = SUSTAINED_DESYNC_MS + 6 * 60_000;

/**
 * Extracted from cache-invalidation-across-regions.test.ts's "Finish from
 * the fully-recovered path -> resolved/optimal" (the SAFE_SEQUENCE_ACTIONS
 * path) — this scenario has an authored acceptableCondition
 * (bounded-acceptable-swr), so optimal requires the fully-recovered state
 * rather than the bounded-but-safe SWR tradeoff tier.
 */
export const cacheInvalidationAcrossRegionsGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cache-invalidation-across-regions",
  actions: [
    {
      atMs: SUSTAINED_DESYNC_MS + 1_000,
      controlKey: REGIONAL_INVALIDATOR_ISOLATION_KEY,
      value: true,
    },
    {
      atMs: SUSTAINED_DESYNC_MS + 2_000,
      controlKey: EU_INVALIDATION_REPLAY_MODE_KEY,
      value: "deduplicated",
    },
    { atMs: SUSTAINED_DESYNC_MS + 3_000, controlKey: US_CACHE_MODE_KEY, value: "bypass" },
  ],
  finishAtMs: RECOVERY_WINDOW_FULL_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
