import type { ScenarioGoldenPath } from "./types";
import { DETECTION_RULE_VERSION_KEY } from "../abuse-prevention-false-positive-storm/definition";

/**
 * Extracted from abuse-prevention-false-positive-storm.test.ts's
 * "targeted-rollback-fixed is Finish-eligible as optimal" — rolls the
 * detection rule back to the known-good v1-stable version, sustained
 * through the safe window. Asserted resolved/optimal via
 * evaluateCandidateDeclaredFinish.
 */
export const abusePreventionFalsePositiveStormGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "abuse-prevention-false-positive-storm",
  actions: [{ atMs: 31_000, controlKey: DETECTION_RULE_VERSION_KEY, value: "v1-stable" }],
  finishAtMs: 60_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
