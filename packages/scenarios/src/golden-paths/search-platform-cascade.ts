import type { ScenarioGoldenPath } from "./types";
import {
  CACHE_KEY,
  FEATURE_STORE_USAGE_KEY,
  PARTIAL_RESULT_MODE_KEY,
  RANKING_INCLUSION_KEY,
} from "../search-platform-cascade/definition";

/**
 * Extracted from search-platform-cascade.test.ts's "the fully restored,
 * drained end-state (ranking back, capacity safe) is eligible at the
 * optimal tier" case: the degraded-quality-safe chain (exclude ranking,
 * drop feature-store usage, enable bounded-cache partial results) run out
 * past the coordinator drain window, then ranking/feature-store/partial
 * results are all restored to their healthy settings once it is safe.
 */
export const searchPlatformCascadeGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "search-platform-cascade",
  actions: [
    { atMs: 31_000, controlKey: RANKING_INCLUSION_KEY, value: "excluded" },
    { atMs: 31_000, controlKey: FEATURE_STORE_USAGE_KEY, value: "off" },
    { atMs: 31_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "on" },
    { atMs: 31_000, controlKey: CACHE_KEY, value: "on" },
    { atMs: 151_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
    { atMs: 151_000, controlKey: FEATURE_STORE_USAGE_KEY, value: "full" },
    { atMs: 151_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "off" },
  ],
  finishAtMs: 190_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
