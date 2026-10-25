import type { ScenarioGoldenPath } from "./types";
import { RESPONSE_FIELD_SET_MODE_KEY } from "../multi-service-memory-pressure-incident/definition";

const SHAPE_CHANGE_SHIPPED_MS = 30_000;
const DEPENDENCY_A_GC_THRASHING_MS = SHAPE_CHANGE_SHIPPED_MS + 40_000;
const DECAY_WINDOW_FULLY_RECOVERED_MS = DEPENDENCY_A_GC_THRASHING_MS + 90_000;

/**
 * Extracted from multi-service-memory-pressure-incident.test.ts's
 * "Finish from optimal -> resolved/optimal" case (root cause fix #1:
 * response field set, fully decayed).
 */
export const multiServiceMemoryPressureIncidentGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "multi-service-memory-pressure-incident",
  actions: [
    { atMs: DEPENDENCY_A_GC_THRASHING_MS + 1_000, controlKey: RESPONSE_FIELD_SET_MODE_KEY, value: "reduced" },
  ],
  finishAtMs: DECAY_WINDOW_FULLY_RECOVERED_MS + 16_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
