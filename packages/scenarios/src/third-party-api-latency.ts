import type { ScenarioDefinition } from "./types";
import {
  thirdPartyApiLatencySimulation,
  API_TIMEOUT_MS_KEY,
  CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
  ASYNC_PROCESSING_ENABLED_KEY,
} from "./third-party-api-latency/definition";
import { thirdPartyApiLatencyCandidateUI } from "./third-party-api-latency/candidate-ui";
import { THIRD_PARTY_API_LATENCY_SCORING } from "./third-party-api-latency/scoring";

/**
 * Third-Party API Latency — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). An
 * external shipping-rate vendor you don't control has started responding
 * slowly — not failing outright, just slow — and every checkout request
 * is blocking on it. You cannot make the vendor faster; the only levers
 * are on your own side of the integration: how long you're willing to
 * wait, whether you fall back to a cached rate, and whether the call
 * even needs to block checkout at all.
 */
export const thirdPartyApiLatency: ScenarioDefinition = {
  id: "third-party-api-latency",
  slug: "third-party-api-latency",
  version: 1,
  name: "Third-Party API Latency",
  description:
    "A third-party shipping-rate API you integrate with — but don't control — has started responding slowly. It isn't erroring, just slow, and every checkout request is blocking on its response. Thread pool utilization is climbing and customers are abandoning checkout. Diagnose how to insulate your system from a vendor you can't fix before checkout capacity runs out.",
  difficulty: "intermediate",
  estimatedMinutes: 12,
  isFree: false,
  structure: "linear",
  simulation: thirdPartyApiLatencySimulation,
  library: {
    category: "API & Traffic",
    tags: ["Third-Party APIs", "Timeouts", "Caching", "Fallbacks", "Resilience"],
    skills: [
      "Diagnosing external dependency slowness",
      "Timeout tuning for third-party integrations",
      "Cached-response fallback design",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "An external shipping-rate vendor is slow, not down — every checkout request blocks on it until you insulate your own system.",
  },
};

export {
  thirdPartyApiLatencySimulation,
  thirdPartyApiLatencyCandidateUI,
  THIRD_PARTY_API_LATENCY_SCORING,
  API_TIMEOUT_MS_KEY,
  CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
  ASYNC_PROCESSING_ENABLED_KEY,
};
