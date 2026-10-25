import type { ScenarioGoldenPath } from "./types";
import {
  MIGRATION_REPAIR_KEY,
  REGION_ROLLOUT_EU_KEY,
} from "../global-feature-rollout-incident/definition";

/**
 * Extracted from global-feature-rollout-incident.test.ts's "optimal path
 * (halt + repair) scores near-maximum with full dataIntegrity credit"
 * (SAFE_HALT_AND_REPAIR_ACTIONS: halt EU, then engage repair once growth
 * has genuinely stopped). One of two independently-viable optimal paths;
 * this one is the "alternate strong path 1" per the test file's comment.
 */
export const globalFeatureRolloutIncidentGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "global-feature-rollout-incident",
  actions: [
    { atMs: 201_000, controlKey: REGION_ROLLOUT_EU_KEY, value: "halted" },
    { atMs: 202_000, controlKey: MIGRATION_REPAIR_KEY, value: "repairing" },
  ],
  finishAtMs: 590_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
