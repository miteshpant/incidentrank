import type { ScenarioGoldenPath } from "./types";
import { STATIC_GROUP_MEMBERSHIP_ENABLED_KEY } from "../consumer-rebalance-storm/definition";

/**
 * Extracted from consumer-rebalance-storm.test.ts's "good" case in
 * "orders good >= acceptableTierPartial > baseline > harmful" — static
 * group membership lets a restarted consumer rejoin its prior
 * assignment without a full rebalance, satisfying the full optimal-tier
 * successCondition (groupStableTimeRatio 97 >= 90, effectiveThroughput
 * 3,900 >= 3,000, groupStatus "normal" != "critical").
 */
export const consumerRebalanceStormGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "consumer-rebalance-storm",
  actions: [{ atMs: 31_000, controlKey: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY, value: true }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
