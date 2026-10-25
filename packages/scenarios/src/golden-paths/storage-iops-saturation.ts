import type { ScenarioGoldenPath } from "./types";
import { STORAGE_TIER_KEY } from "../storage-iops-saturation/definition";

/**
 * Extracted from storage-iops-saturation.test.ts's "Finish from optimal ->
 * resolved/optimal" — explicitly asserts outcome "resolved" and
 * completionTier "optimal".
 */
export const storageIopsSaturationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "storage-iops-saturation",
  actions: [{ atMs: 31_000, controlKey: STORAGE_TIER_KEY, value: "provisioned-iops" }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
