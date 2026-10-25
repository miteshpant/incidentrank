import type { ScenarioDefinition } from "./types";
import {
  requestTimeoutCascadeSimulation,
  GATEWAY_TO_A_TIMEOUT_MS_KEY,
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
  GATEWAY_RETRY_COUNT_KEY,
  REQUEST_CANCELLATION_ENABLED_KEY,
  CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
} from "./request-timeout-cascade/definition";
import { requestTimeoutCascadeCandidateUI } from "./request-timeout-cascade/candidate-ui";
import { REQUEST_TIMEOUT_CASCADE_SCORING } from "./request-timeout-cascade/scoring";

/**
 * Request Timeout Cascade — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 47, API & Traffic). The
 * Dependency at the bottom of a four-hop call chain (Client -> Gateway ->
 * Service A -> Service B -> Dependency) develops a bounded latency blip —
 * it is slow, not failing, and the blip itself does not keep worsening on
 * its own. The actual incident is that the Gateway retries a timed-out
 * call without cancelling the original request chain underneath it, so
 * every retry starts a brand-new call chain through Service A, Service B,
 * and the Dependency while the old, abandoned chain keeps silently
 * consuming threads and connections at every layer below. The candidate
 * must reason about the timeout BUDGET across all three hops at once —
 * each layer's timeout meaningfully shorter than the combined budget of
 * everything beneath it — AND recognize that re-proportioning the budget
 * alone does not stop already-abandoned work from accumulating unless
 * cancellation is also propagated downstream. Fixing only one hop, or
 * only one half of the fix, looks like progress on one metric while the
 * underlying accumulation continues elsewhere in the chain.
 */
export const requestTimeoutCascade: ScenarioDefinition = {
  id: "request-timeout-cascade",
  slug: "request-timeout-cascade",
  version: 1,
  name: "Request Timeout Cascade",
  description:
    "A dependency at the bottom of a four-hop call chain (Gateway, Service A, Service B, and the Dependency itself) has developed a latency blip — it is slow, not failing outright, and customers depend on the capability it provides. The Gateway is configured to retry a request when its own call times out. No request chain is being explicitly cancelled anywhere along the way when a caller gives up on it. In-flight request counts and connection utilization are climbing at every layer, and customer-facing latency is degrading with them. Diagnose where in the chain pressure is actually accumulating — and why it keeps accumulating even after a fix lands on one hop — before connection capacity runs out anywhere in the chain.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  simulation: requestTimeoutCascadeSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Timeouts", "Retries", "Circuit Breaker", "Request Cancellation", "Thread Pools"],
    skills: [
      "Reasoning about timeout budgets across multiple chained services",
      "Recognizing retry-without-cancellation as a distinct accumulation mechanism from retry amplification against a single slow hop",
      "Distinguishing a re-proportioned, cancellation-aware fix from a dependency fenced off with a circuit breaker",
      "Identifying why fixing a single hop's timeout in isolation leaves upstream capacity oversized",
    ],
    shortDescription:
      "A slow dependency triggers Gateway retries that never cancel the original request, so abandoned work piles up across four hops even after any single timeout gets tightened.",
  },
};

export {
  requestTimeoutCascadeSimulation,
  requestTimeoutCascadeCandidateUI,
  REQUEST_TIMEOUT_CASCADE_SCORING,
  GATEWAY_TO_A_TIMEOUT_MS_KEY,
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
  GATEWAY_RETRY_COUNT_KEY,
  REQUEST_CANCELLATION_ENABLED_KEY,
  CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
};
