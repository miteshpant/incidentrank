import type { ScenarioGoldenPath } from "./types";
import {
  CANCELLATION_PROPAGATION_KEY,
  CIRCUIT_BREAKER_KEY,
  GATEWAY_RETRIES_KEY,
  SERVICE_A_RETRIES_KEY,
  SERVICE_B_RETRIES_KEY,
} from "../cross-service-retry-amplification/definition";

/**
 * Extracted from cross-service-retry-amplification.test.ts's "fully
 * safe path is eligible for an OPTIMAL-tier Finish" case, run until
 * INCIDENT_START_MS + 55_000 (past the backlog-drain window plus the
 * 30s success sustain window). INCIDENT_START_MS = 60_000.
 */
export const crossServiceRetryAmplificationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cross-service-retry-amplification",
  actions: [
    { atMs: 61_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
    { atMs: 61_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
    { atMs: 61_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
    { atMs: 61_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
    { atMs: 61_000, controlKey: CANCELLATION_PROPAGATION_KEY, value: "on" },
  ],
  finishAtMs: 115_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
