import type { ScenarioGoldenPath } from "./types";
import {
  DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
  INSPECT_FLAG_AUDIT_LOG_KEY,
  INSPECT_LEGACY_ENGINE_LOGS_KEY,
} from "../stale-feature-flag-kill-switch/definition";

const WAKE_MS = 30_000;

/**
 * Extracted from stale-feature-flag-kill-switch.test.ts's "investigating
 * the flag audit log, then the legacy engine logs, then fixing — reaches
 * the investigated-then-fixed path" — the scenario's own authored strong
 * path. definition.ts's completion has no acceptableCondition authored,
 * so the resolved outcome is automatically tier optimal.
 */
export const staleFeatureFlagKillSwitchGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "stale-feature-flag-kill-switch",
  actions: [
    { atMs: WAKE_MS + 1_000, controlKey: INSPECT_FLAG_AUDIT_LOG_KEY, value: true },
    { atMs: WAKE_MS + 2_000, controlKey: INSPECT_LEGACY_ENGINE_LOGS_KEY, value: true },
    { atMs: WAKE_MS + 3_000, controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY, value: true },
  ],
  finishAtMs: WAKE_MS + 3_000 + 16_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
