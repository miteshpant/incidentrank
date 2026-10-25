import type { ScenarioGoldenPath } from "./types";
import {
  PARSER_SCHEMA_COMPAT_MODE_KEY,
  REPLAY_FAILURE_FILTER_KEY,
  RETRY_DELAY_MS_KEY,
} from "../dead-letter-queue-explosion/definition";

/**
 * Extracted from dead-letter-queue-explosion.test.ts's "strong path:
 * parser fix + filtered replay + paced retry delay fully recovers and
 * drains the backlog" — asserted resolved/optimal via
 * evaluateCandidateDeclaredFinish in the "Finish from optimal ->
 * resolved/optimal" test case.
 */
export const deadLetterQueueExplosionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "dead-letter-queue-explosion",
  actions: [
    { atMs: 31_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
    { atMs: 32_000, controlKey: REPLAY_FAILURE_FILTER_KEY, value: "schemaOnly" },
    { atMs: 33_000, controlKey: RETRY_DELAY_MS_KEY, value: 1_000 },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
