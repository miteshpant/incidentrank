import type { ScenarioGoldenPath } from "./types";
import {
  DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
  ENDPOINT_CACHE_TTL_SECONDS_KEY,
  FALLBACK_ROUTING_KEY,
} from "../service-discovery-failure/definition";

/**
 * Extracted from service-discovery-failure.test.ts's "Finish from an
 * optimal state resolves with tier optimal" case: tighten the discovery
 * refresh interval and endpoint cache TTL, and enable fallback routing.
 */
export const serviceDiscoveryFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "service-discovery-failure",
  actions: [
    { atMs: 31_000, controlKey: DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY, value: 10 },
    { atMs: 31_000, controlKey: ENDPOINT_CACHE_TTL_SECONDS_KEY, value: 15 },
    { atMs: 31_000, controlKey: FALLBACK_ROUTING_KEY, value: true },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
