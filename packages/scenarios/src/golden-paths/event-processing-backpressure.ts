import type { ScenarioGoldenPath } from "./types";
import { CONSUMER_COUNT_KEY, PRIORITY_ROUTING_ENABLED_KEY } from "../event-processing-backpressure/definition";

/**
 * Extracted from event-processing-backpressure.test.ts's "Finish from
 * optimal -> resolved/optimal" (scaling consumers with priority routing
 * balances every subsystem) — completionTier "optimal".
 */
export const eventProcessingBackpressureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "event-processing-backpressure",
  actions: [
    { atMs: 31_000, controlKey: CONSUMER_COUNT_KEY, value: 8 },
    { atMs: 31_000, controlKey: PRIORITY_ROUTING_ENABLED_KEY, value: true },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
