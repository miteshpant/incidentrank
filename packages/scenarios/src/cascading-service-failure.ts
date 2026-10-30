import type { ScenarioDefinition } from "./types";
import {
  cascadingServiceFailureSimulation,
  ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
  UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
  REQUEST_QUEUE_DEPTH_LIMIT_KEY,
} from "./cascading-service-failure/definition";
import { cascadingServiceFailureCandidateUI } from "./cascading-service-failure/candidate-ui";
import { CASCADING_SERVICE_FAILURE_SCORING } from "./cascading-service-failure/scoring";

/**
 * Cascading Service Failure — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). One
 * service deep in a call chain starts failing, and because every
 * upstream caller blocks synchronously waiting on it, the failure
 * propagates backward — multiple services end up reporting unhealthy
 * even though only one is actually broken. The candidate must
 * distinguish the real root cause from the cascading symptoms around it,
 * not "fix" services that were never actually broken.
 */
export const cascadingServiceFailure: ScenarioDefinition = {
  id: "cascading-service-failure",
  slug: "cascading-service-failure",
  version: 1,
  name: "Cascading Service Failure",
  description:
    "Checkout Service and Order Service have both started reporting degraded health, and the on-call dashboard is lighting up across multiple teams at once. Request queues are growing throughout the chain and checkout success is dropping. Before you scale or restart anything, find out which service is actually broken and which ones are just waiting on it.",
  difficulty: "staff",
  estimatedMinutes: 18,
  isFree: false,
  structure: "linear",
  simulation: cascadingServiceFailureSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Circuit Breakers", "Root Cause Analysis", "Microservices", "Resilience", "Backpressure"],
    skills: [
      "Distinguishing root cause from cascading symptoms",
      "Scoping circuit breakers to the actual point of failure",
      "Recognizing when a mitigation wastes effort on a healthy service",
      "Backpressure and load-shedding tradeoffs",
    ],
    shortDescription:
      "One deep service failure propagates backward through a synchronous call chain, making multiple healthy services look broken at once.",
  },
};

export {
  cascadingServiceFailureSimulation,
  cascadingServiceFailureCandidateUI,
  CASCADING_SERVICE_FAILURE_SCORING,
  ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
  UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
  REQUEST_QUEUE_DEPTH_LIMIT_KEY,
};
