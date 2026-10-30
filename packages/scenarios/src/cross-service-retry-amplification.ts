import type { ScenarioDefinition } from "./types";
import {
  CANCELLATION_PROPAGATION_KEY,
  CIRCUIT_BREAKER_KEY,
  crossServiceRetryAmplificationSimulation,
  GATEWAY_RETRIES_KEY,
  SERVICE_A_RETRIES_KEY,
  SERVICE_B_RETRIES_KEY,
  SERVICE_C_CONCURRENCY_KEY,
  SERVICE_C_RETRIES_KEY,
  SERVICE_C_TIMEOUT_SECONDS_KEY,
} from "./cross-service-retry-amplification/definition";
import { crossServiceRetryAmplificationCandidateUI } from "./cross-service-retry-amplification/candidate-ui";
import { CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING } from "./cross-service-retry-amplification/scoring";

/**
 * Cross-Service Retry Amplification — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6dsupport.md, scenario 65). A single
 * customer request travels Client -> Gateway -> Service A -> Service B
 * -> Service C -> External Provider. Each of the first four hops was
 * independently built with its own retry policy, by teams that never
 * coordinated with each other. When the External Provider degrades
 * moderately, every layer along the chain starts retrying the SAME
 * underlying customer request independently, and retries compound
 * multiplicatively rather than additively: a retry at one layer
 * re-issues the request through every layer still downstream of it,
 * each of which may retry again. The candidate must decide WHICH ONE
 * layer is allowed to own retries toward the provider — not simply pick
 * a better retry count or backoff value at the layer currently in
 * front of them.
 */
export const crossServiceRetryAmplification: ScenarioDefinition = {
  id: "cross-service-retry-amplification",
  slug: "cross-service-retry-amplification",
  version: 1,
  name: "Cross-Service Retry Amplification",
  description:
    "A customer request flows through Gateway, Service A, Service B, and Service C before reaching an External Provider. Each of these four layers was built independently and each already retries failed calls on its own. The External Provider has just begun a moderate degradation — elevated latency and a higher transient error rate, not an outage. Because every layer retries independently, the SAME original customer request can be re-issued by up to all four layers at once, and those retries compound multiplicatively down the chain rather than simply adding up. Business invariants: customer requests may retry at exactly one controlled ownership boundary — retrying at multiple layers simultaneously is never acceptable, however well-intentioned each individual layer's retry policy is. The External Provider must be protected from multiplicative amplification — its connection capacity is shared with every other customer of ours, not just this request path. Cancellation and timeout propagation should prevent zombie work: once a request has been abandoned or has failed past its owning layer's retry budget, every downstream layer still processing it on its behalf must be told to stop, not left running to completion for no one. Diagnose which layer should be the one retry owner, and verify that the other layers have actually stood down — a visible improvement at one layer while amplification simply continues through the others is not a resolution.",
  difficulty: "senior_staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: crossServiceRetryAmplificationSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: ["Retries", "Circuit Breaking", "Timeouts", "Backpressure", "Cancellation", "Ownership"],
    skills: [
      "Recognizing retry amplification across independently-configured service boundaries",
      "Choosing a single retry-owning layer instead of tuning a single global retry value",
      "Sequencing retry-ownership consolidation before timeout/circuit-breaker tuning",
      "Diagnosing incomplete relief when only one of several retrying layers is addressed",
    ],
    shortDescription:
      "Four independently-configured retry layers are each re-issuing the same degraded-provider request, multiplying effective load far beyond original customer traffic.",
  },
};

export {
  crossServiceRetryAmplificationSimulation,
  crossServiceRetryAmplificationCandidateUI,
  CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
  GATEWAY_RETRIES_KEY,
  SERVICE_A_RETRIES_KEY,
  SERVICE_B_RETRIES_KEY,
  SERVICE_C_RETRIES_KEY,
  SERVICE_C_TIMEOUT_SECONDS_KEY,
  CIRCUIT_BREAKER_KEY,
  CANCELLATION_PROPAGATION_KEY,
  SERVICE_C_CONCURRENCY_KEY,
};
