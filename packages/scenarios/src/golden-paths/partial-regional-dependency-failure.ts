import type { ScenarioGoldenPath } from "./types";
import {
  APAC_ROUTING_MODE_KEY,
  DEPENDENCY_FALLBACK_ENABLED_KEY,
  EU_ROUTING_MODE_KEY,
} from "../partial-regional-dependency-failure/definition";

const REGIONAL_DIVERGENCE_MS = 30_000;

/**
 * Extracted from partial-regional-dependency-failure.test.ts's
 * REGIONAL_MITIGATION_ACTIONS ("Finish from optimal -> resolved/optimal") —
 * region-scoped isolation of EU and APAC with dependency fallback enabled,
 * leaving the healthy US region fully untouched.
 */
export const partialRegionalDependencyFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "partial-regional-dependency-failure",
  actions: [
    { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: DEPENDENCY_FALLBACK_ENABLED_KEY, value: true },
    { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: EU_ROUTING_MODE_KEY, value: "isolate" },
    { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: APAC_ROUTING_MODE_KEY, value: "isolate" },
  ],
  finishAtMs: REGIONAL_DIVERGENCE_MS + 32_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
