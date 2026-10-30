import type { ScenarioDefinition } from "./types";
import {
  downstreamDependencyFailureSimulation,
  CIRCUIT_BREAKER_ENABLED_KEY,
  REQUEST_TIMEOUT_MS_KEY,
  FALLBACK_RESPONSE_ENABLED_KEY,
} from "./downstream-dependency-failure/definition";
import { downstreamDependencyFailureCandidateUI } from "./downstream-dependency-failure/candidate-ui";
import { DOWNSTREAM_DEPENDENCY_FAILURE_SCORING } from "./downstream-dependency-failure/scoring";

/**
 * Downstream Dependency Failure — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). An
 * internal downstream service starts timing out on every request, and
 * the calling service has no circuit breaker or fallback — every
 * request blocks waiting on a known-dead dependency, exhausting the
 * calling service's own thread pool. The candidate must recognize that
 * isolating the failure (a circuit breaker) is the real fix, not simply
 * giving the downstream more time to respond.
 */
export const downstreamDependencyFailure: ScenarioDefinition = {
  id: "downstream-dependency-failure",
  slug: "downstream-dependency-failure",
  version: 1,
  name: "Downstream Dependency Failure",
  description:
    "An internal downstream service has started timing out on every request. The calling service has no circuit breaker or fallback in place, so every blocked call is tying up its own thread pool, and the calling service's own capacity is collapsing even though it's healthy in isolation. Diagnose the cascade and isolate the failure before the calling service runs out of capacity entirely.",
  difficulty: "senior",
  estimatedMinutes: 12,
  isFree: false,
  structure: "linear",
  simulation: downstreamDependencyFailureSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: ["Circuit Breakers", "Resilience", "Fallbacks", "Isolation", "Timeouts"],
    skills: [
      "Diagnosing cascading capacity exhaustion",
      "Circuit breaker design and tuning",
      "Fallback and degraded-mode response design",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A failing downstream service exhausts the calling service's own capacity because every blocked request ties up a thread waiting on a dead dependency.",
  },
};

export {
  downstreamDependencyFailureSimulation,
  downstreamDependencyFailureCandidateUI,
  DOWNSTREAM_DEPENDENCY_FAILURE_SCORING,
  CIRCUIT_BREAKER_ENABLED_KEY,
  REQUEST_TIMEOUT_MS_KEY,
  FALLBACK_RESPONSE_ENABLED_KEY,
};
