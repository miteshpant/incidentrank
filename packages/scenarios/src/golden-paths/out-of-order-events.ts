import type { ScenarioGoldenPath } from "./types";
import {
  PARTITION_KEY_STRATEGY_KEY,
  REORDER_BUFFER_ENABLED_KEY,
} from "../out-of-order-events/definition";

const ROUTING_CHANGE_LIVE_MS = 30_000;

/**
 * Extracted from out-of-order-events.test.ts's "Finish from optimal ->
 * resolved/optimal" case (strong path: re-keying by account id plus the
 * reorder buffer, fully restoring ordering).
 */
export const outOfOrderEventsGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "out-of-order-events",
  actions: [
    { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "account-id-keyed" },
    { atMs: ROUTING_CHANGE_LIVE_MS + 1_000, controlKey: REORDER_BUFFER_ENABLED_KEY, value: true },
  ],
  finishAtMs: ROUTING_CHANGE_LIVE_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
