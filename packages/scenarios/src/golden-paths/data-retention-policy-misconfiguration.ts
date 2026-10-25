import type { ScenarioGoldenPath } from "./types";
import {
  DELETION_POLICY_MODE_KEY,
  LEGAL_HOLD_ENFORCEMENT_KEY,
} from "../data-retention-policy-misconfiguration/definition";

/**
 * Extracted from data-retention-policy-misconfiguration.test.ts's
 * "Alternate strong path A" case "reaches genuine OPTIMAL once the full
 * drain window elapses, with every other control left at its untouched
 * default" (TARGETED_CORRECTION_DIRECT_ACTIONS, run until
 * DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000). SUSTAINED_MISCONFIGURATION_MS
 * = 200_000 and DRAIN_WINDOW_FULLY_RECOVERED_MS = 500_000 per
 * data-retention-policy-misconfiguration/timed-events.ts.
 */
export const dataRetentionPolicyMisconfigurationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "data-retention-policy-misconfiguration",
  actions: [
    { atMs: 201_000, controlKey: DELETION_POLICY_MODE_KEY, value: "financial-class-corrected" },
    { atMs: 202_000, controlKey: LEGAL_HOLD_ENFORCEMENT_KEY, value: "enforced" },
  ],
  finishAtMs: 535_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
