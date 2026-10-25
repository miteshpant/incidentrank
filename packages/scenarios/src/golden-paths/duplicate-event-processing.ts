import type { ScenarioGoldenPath } from "./types";
import {
  DEDUPLICATION_WINDOW_SECONDS_KEY,
  IDEMPOTENT_PROCESSING_ENABLED_KEY,
} from "../duplicate-event-processing/definition";

/**
 * Extracted from duplicate-event-processing.test.ts's "strong path:
 * idempotent processing WITH a real dedup window holds duplicates at
 * zero" — asserted resolved/optimal via evaluateCandidateDeclaredFinish
 * in the "Finish from optimal -> resolved/optimal" test case. No
 * acceptableCondition is authored for this scenario.
 */
export const duplicateEventProcessingGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "duplicate-event-processing",
  actions: [
    { atMs: 31_000, controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY, value: true },
    { atMs: 32_000, controlKey: DEDUPLICATION_WINDOW_SECONDS_KEY, value: 120 },
  ],
  finishAtMs: 55_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
