import type { ScenarioGoldenPath } from "./types";
import { DESTINATION_ISOLATION_ENABLED_KEY } from "../webhook-delivery-storm/definition";

/**
 * Extracted from webhook-delivery-storm.test.ts's "Finish from optimal
 * (isolated) -> resolved/optimal" — explicitly asserts outcome "resolved"
 * and completionTier "optimal".
 */
export const webhookDeliveryStormGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "webhook-delivery-storm",
  actions: [{ atMs: 31_000, controlKey: DESTINATION_ISOLATION_ENABLED_KEY, value: true }],
  finishAtMs: 70_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
