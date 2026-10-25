import type { ScenarioGoldenPath } from "./types";
import {
  DISTRUST_MARKING_KEY,
  PROMOTION_GATE_KEY,
  ROLLBACK_TARGET_KEY,
  SERVING_ARTIFACT_ACTION_KEY,
} from "../training-pipeline-produces-corrupted-model-artifact/definition";

/**
 * Extracted from training-pipeline-produces-corrupted-model-artifact.test.ts's
 * ROLLBACK_LAST_KNOWN_GOOD_FULL_ACTIONS ("both alternate strong paths reach
 * OPTIMAL with an honest cost distinction, not a forced tie") — explicitly
 * asserts rollbackResult.completionTier === "optimal".
 */
export const trainingPipelineProducesCorruptedModelArtifactGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "training-pipeline-produces-corrupted-model-artifact",
  actions: [
    { atMs: 21_000, controlKey: SERVING_ARTIFACT_ACTION_KEY, value: "quarantine" },
    { atMs: 22_000, controlKey: ROLLBACK_TARGET_KEY, value: "last-known-good" },
    { atMs: 23_000, controlKey: PROMOTION_GATE_KEY, value: "trust-validation" },
    { atMs: 24_000, controlKey: DISTRUST_MARKING_KEY, value: "quarantine-mark-distrusted" },
  ],
  finishAtMs: 235_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
