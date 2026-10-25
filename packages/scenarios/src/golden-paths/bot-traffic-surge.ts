import type { ScenarioGoldenPath } from "./types";
import {
  ENDPOINT_PROTECTION_SCOPE_KEY,
  TENANT_QUOTA_ENFORCEMENT_KEY,
  TRAFFIC_SAMPLING_ENABLED_KEY,
} from "../bot-traffic-surge/definition";

const BOT_SURGE_RISING_MS = 30_000;

/**
 * Extracted from bot-traffic-surge.test.ts's "Finish from optimal ->
 * resolved/optimal" — no acceptableCondition is authored for this
 * scenario, so the resolved outcome is automatically tier optimal
 * (explicitly asserted there via result.completionTier === "optimal").
 */
export const botTrafficSurgeGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "bot-traffic-surge",
  actions: [
    { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: TRAFFIC_SAMPLING_ENABLED_KEY, value: true },
    {
      atMs: BOT_SURGE_RISING_MS + 2_000,
      controlKey: ENDPOINT_PROTECTION_SCOPE_KEY,
      value: "targeted",
    },
    {
      atMs: BOT_SURGE_RISING_MS + 3_000,
      controlKey: TENANT_QUOTA_ENFORCEMENT_KEY,
      value: true,
    },
  ],
  finishAtMs: BOT_SURGE_RISING_MS + 40_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
