import type { ScenarioDefinition } from "./types";
import {
  dependencyTimeoutCascadeSimulation,
  API_TO_A_TIMEOUT_MS_KEY,
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_C_TIMEOUT_MS_KEY,
  B_TO_C_RETRY_COUNT_KEY,
  CIRCUIT_BREAKER_B_TO_C_KEY,
  SERVICE_A_CONCURRENCY_LIMIT_KEY,
} from "./dependency-timeout-cascade/definition";
import { dependencyTimeoutCascadeCandidateUI } from "./dependency-timeout-cascade/candidate-ui";
import { DEPENDENCY_TIMEOUT_CASCADE_SCORING } from "./dependency-timeout-cascade/scoring";

/**
 * Dependency Timeout Cascade — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 35). Service C, the
 * deepest dependency in a four-hop call chain, has slowed down sharply.
 * The timeouts configured at each hop above it were never proportioned
 * against one another: every hop's timeout is long enough that its
 * threads and connections block for the full duration of whatever is
 * slow beneath it, so the exhaustion compounds upward from Service B
 * through Service A and into the API itself. The candidate must reason
 * about the timeout BUDGET across the whole chain — tightening any one
 * hop in isolation is not the same as re-proportioning all of them
 * together, and retrying a dependency that is uniformly slow (not
 * intermittently flaky) only multiplies the load it has to serve.
 */
export const dependencyTimeoutCascade: ScenarioDefinition = {
  id: "dependency-timeout-cascade",
  slug: "dependency-timeout-cascade",
  version: 1,
  name: "Dependency Timeout Cascade",
  description:
    "Service C, the deepest dependency behind the API, Service A, and Service B, has slowed down sharply. Each hop above it keeps its own timeout, and none of them were ever proportioned against the others, so blocked threads and connections are accumulating from the bottom of the chain upward. The capability Service C provides is not considered critical enough to justify indefinitely blocking every service above it, and customers should see fast, clear failures rather than long hangs. Diagnose which hop is actually accumulating pressure and bring the chain back to a durable, sustainable state.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: dependencyTimeoutCascadeSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: ["Timeouts", "Circuit Breaker", "Retries", "Thread Pools", "Cascading Failure"],
    skills: [
      "Reasoning about timeout budgets across multiple chained services",
      "Recognizing retry amplification against a uniformly slow (not flaky) dependency",
      "Distinguishing a re-proportioned fix from a dependency fenced off with a circuit breaker",
      "Identifying which subsystem a mitigation's pressure actually transfers to next",
    ],
    shortDescription:
      "A deep dependency has slowed down, and misaligned timeouts across four hops are letting blocked connections cascade all the way up to the API.",
  },
};

export {
  dependencyTimeoutCascadeSimulation,
  dependencyTimeoutCascadeCandidateUI,
  DEPENDENCY_TIMEOUT_CASCADE_SCORING,
  API_TO_A_TIMEOUT_MS_KEY,
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_C_TIMEOUT_MS_KEY,
  B_TO_C_RETRY_COUNT_KEY,
  CIRCUIT_BREAKER_B_TO_C_KEY,
  SERVICE_A_CONCURRENCY_LIMIT_KEY,
};
