import type { ScenarioGoldenPath } from "./types";
import {
  PAYLOAD_LOGGING_MODE_KEY,
  RETRY_COUNT_KEY,
  RETRY_OWNERSHIP_KEY,
  SAMPLING_RATE_PERCENT_KEY,
  TELEMETRY_DUPLICATION_KEY,
} from "../expensive-retry-and-logging-amplification/definition";

/**
 * Extracted from expensive-retry-and-logging-amplification.test.ts's
 * COMBINED_OPTIMAL_ACTIONS (both alternate strong paths A + B engaged
 * together), used by "both combined reach OPTIMAL with identical
 * recovery/dataIntegrity/reliability..." — completionTier "optimal".
 * SUSTAINED_UNADDRESSED_MS = 255_000; COST_SETTLING_FULLY_DONE_MS =
 * 345_000 (from timed-events.ts).
 */
export const expensiveRetryAndLoggingAmplificationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "expensive-retry-and-logging-amplification",
  actions: [
    { atMs: 256_000, controlKey: RETRY_COUNT_KEY, value: 1 },
    { atMs: 257_000, controlKey: RETRY_OWNERSHIP_KEY, value: "worker-owns-retries" },
    { atMs: 256_000, controlKey: SAMPLING_RATE_PERCENT_KEY, value: 10 },
    { atMs: 257_000, controlKey: TELEMETRY_DUPLICATION_KEY, value: "deduplicated" },
    { atMs: 258_000, controlKey: PAYLOAD_LOGGING_MODE_KEY, value: "metadata-only" },
  ],
  finishAtMs: 380_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
