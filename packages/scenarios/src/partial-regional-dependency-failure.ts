import type { ScenarioDefinition } from "./types";
import {
  partialRegionalDependencyFailureSimulation,
  US_ROUTING_MODE_KEY,
  EU_ROUTING_MODE_KEY,
  APAC_ROUTING_MODE_KEY,
  DEPENDENCY_FALLBACK_ENABLED_KEY,
  TIMEOUT_POLICY_MS_KEY,
  GLOBAL_CIRCUIT_BREAKER_KEY,
} from "./partial-regional-dependency-failure/definition";
import { partialRegionalDependencyFailureCandidateUI } from "./partial-regional-dependency-failure/candidate-ui";
import { PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING } from "./partial-regional-dependency-failure/scoring";

/**
 * Partial Regional Dependency Failure — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 41). A shared dependency
 * behind the US, EU, and APAC regional services degrades differently in
 * each region at the same time: US calls keep succeeding, EU calls run
 * slow, and APAC calls intermittently fail outright. The candidate must
 * recognize that a single global action applied the same way everywhere
 * is not automatically the right call — a region that was never unhealthy
 * can be made worse by a uniform fix meant for the other two.
 */
export const partialRegionalDependencyFailure: ScenarioDefinition = {
  id: "partial-regional-dependency-failure",
  slug: "partial-regional-dependency-failure",
  version: 1,
  name: "Partial Regional Dependency Failure",
  description:
    "A dependency shared by your US, EU, and APAC regional services is behaving differently by region at the same time: one region's calls are succeeding normally, one is running measurably slower, and one is intermittently failing outright. All three regions serve live customer traffic concurrently, and taking any region off live calls trades that region's full service for a degraded fallback response. Stabilize the platform while accounting for the fact that each region's dependency health is not the same.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: partialRegionalDependencyFailureSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: ["Multi-Region", "Circuit Breaker", "Fallback", "Dependency Health", "Traffic Routing"],
    skills: [
      "Diagnosing region-by-region divergence in a shared dependency",
      "Distinguishing a targeted regional mitigation from a uniform global one",
      "Recognizing when a global control sacrifices a healthy region unnecessarily",
      "Weighing fallback availability against live-call correctness per region",
    ],
    shortDescription:
      "A shared dependency is healthy in one region, slow in another, and intermittently failing in a third — all at once — and a uniform global fix is not automatically the right call.",
  },
};

export {
  partialRegionalDependencyFailureSimulation,
  partialRegionalDependencyFailureCandidateUI,
  PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING,
  US_ROUTING_MODE_KEY,
  EU_ROUTING_MODE_KEY,
  APAC_ROUTING_MODE_KEY,
  DEPENDENCY_FALLBACK_ENABLED_KEY,
  TIMEOUT_POLICY_MS_KEY,
  GLOBAL_CIRCUIT_BREAKER_KEY,
};
