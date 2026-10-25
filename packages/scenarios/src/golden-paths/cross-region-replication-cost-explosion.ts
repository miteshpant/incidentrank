import type { ScenarioGoldenPath } from "./types";
import {
  LOW_PRIORITY_REGION_FAN_OUT_KEY,
  LOW_PRIORITY_REPLICATION_FACTOR_KEY,
} from "../cross-region-replication-cost-explosion/definition";

/**
 * Extracted from cross-region-replication-cost-explosion.test.ts's
 * STRATEGY_A_ACTIONS (scope reduction) case, which reaches completionTier
 * "optimal" via evaluateCandidateDeclaredFinish — run until
 * POLICY_CHANGE_DISCOVERED_MS + 50_000. POLICY_CHANGE_DISCOVERED_MS =
 * 30_000 (cross-region-replication-cost-explosion/timed-events.ts).
 * completionTier is only ever non-null when outcome is "resolved" (see
 * packages/simulator/src/completion.ts), so the asserted optimal tier
 * confirms a resolved outcome too.
 */
export const crossRegionReplicationCostExplosionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cross-region-replication-cost-explosion",
  actions: [
    { atMs: 31_000, controlKey: LOW_PRIORITY_REGION_FAN_OUT_KEY, value: "origin-plus-one" },
    { atMs: 32_000, controlKey: LOW_PRIORITY_REPLICATION_FACTOR_KEY, value: 1 },
  ],
  finishAtMs: 80_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
