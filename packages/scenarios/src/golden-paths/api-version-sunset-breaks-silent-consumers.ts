import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_CONSUMER_REGISTRY_KEY,
  INSPECT_GATEWAY_ACCESS_LOGS_KEY,
  INSPECT_SUPPORT_TICKET_QUEUE_KEY,
  EXTEND_SUNSET_DEADLINE_KEY,
  MIGRATE_DISCOVERED_CONSUMERS_KEY,
} from "../api-version-sunset-breaks-silent-consumers/definition";

const SUNSET_TAKES_EFFECT_MS = 30_000;

/**
 * Extracted from api-version-sunset-breaks-silent-consumers.test.ts's
 * "extend-then-migrate, fully investigated first, reaches the
 * correlated extend-then-migrated path" — one of this branching
 * scenario's two equally-valid strong paths (the other being the
 * shim-then-migrate branch). definition.ts's completion has no
 * acceptableCondition authored, so the resolved outcome is automatically
 * tier optimal.
 */
export const apiVersionSunsetBreaksSilentConsumersGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "api-version-sunset-breaks-silent-consumers",
  actions: [
    { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: INSPECT_CONSUMER_REGISTRY_KEY, value: true },
    { atMs: SUNSET_TAKES_EFFECT_MS + 2_000, controlKey: INSPECT_GATEWAY_ACCESS_LOGS_KEY, value: true },
    { atMs: SUNSET_TAKES_EFFECT_MS + 3_000, controlKey: INSPECT_SUPPORT_TICKET_QUEUE_KEY, value: true },
    { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
    { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
  ],
  finishAtMs: SUNSET_TAKES_EFFECT_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
