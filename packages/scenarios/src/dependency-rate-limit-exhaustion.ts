import type { ScenarioDefinition } from "./types";
import {
  dependencyRateLimitExhaustionSimulation,
  CACHING_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  RETRY_AGGRESSIVENESS_KEY,
  PRIORITY_TRAFFIC_POLICY_KEY,
  OPTIONAL_FEATURE_SUPPRESSED_KEY,
  DEPENDENCY_CONCURRENCY_KEY,
} from "./dependency-rate-limit-exhaustion/definition";
import { dependencyRateLimitExhaustionCandidateUI } from "./dependency-rate-limit-exhaustion/candidate-ui";
import { DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING } from "./dependency-rate-limit-exhaustion/scoring";

/**
 * Dependency Rate-Limit Exhaustion — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 42). A downstream
 * third-party provider enforces a hard request quota on a rolling
 * window. Call volume from the Aggregation Service starts consuming
 * that quota faster than the window can sustain, and left unaddressed
 * the provider begins returning 429s well before the window resets. The
 * candidate must reduce the dependency's sustained call volume below
 * the quota's burn rate — and must recognize that retrying harder
 * against a HARD quota is not a resilience strategy: every retry is
 * itself another counted request, so raising retry aggressiveness once
 * throttling has begun burns through the remaining quota faster than
 * doing nothing at all.
 */
export const dependencyRateLimitExhaustion: ScenarioDefinition = {
  id: "dependency-rate-limit-exhaustion",
  slug: "dependency-rate-limit-exhaustion",
  version: 1,
  name: "Dependency Rate-Limit Exhaustion",
  description:
    "The Aggregation Service calls a third-party provider that enforces a hard request quota on a rolling 10-minute window — once the quota is gone for that window, every call fails until it resets. The provider relationship is commercial and the quota cannot be raised mid-incident. Multiple product surfaces depend on this call path, and one of them is an optional enrichment feature rather than a core one. Bring the dependency's call volume to a level the remaining quota can sustain for the rest of the window, without assuming that retrying a failed call is free.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: dependencyRateLimitExhaustionSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: ["Rate Limiting", "Third-Party Dependency", "Caching", "Retry Behavior", "Quota Management"],
    skills: [
      "Recognizing that retries against a hard quota consume the same budget as original requests",
      "Reducing sustained call volume durably versus suppressing a feature",
      "Evaluating request coalescing and caching as quota-preserving strategies",
      "Prioritizing traffic under a shared, shrinking resource constraint",
    ],
    shortDescription:
      "A third-party provider's hard request quota is being exhausted before its rolling window resets, and retrying harder only makes it worse.",
  },
};

export {
  dependencyRateLimitExhaustionSimulation,
  dependencyRateLimitExhaustionCandidateUI,
  DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
  CACHING_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  RETRY_AGGRESSIVENESS_KEY,
  PRIORITY_TRAFFIC_POLICY_KEY,
  OPTIONAL_FEATURE_SUPPRESSED_KEY,
  DEPENDENCY_CONCURRENCY_KEY,
};
