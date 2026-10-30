import type { ScenarioDefinition } from "./types";
import {
  fanOutRequestExplosionSimulation,
  ENRICHMENT_CALL_ENABLED_KEY,
  FAN_OUT_CONCURRENCY_LIMIT_KEY,
  PARTIAL_RESPONSE_POLICY_KEY,
  REQUEST_BATCHING_ENABLED_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  SERVICE_E_TIMEOUT_MS_KEY,
} from "./fan-out-request-explosion/definition";
import { fanOutRequestExplosionCandidateUI } from "./fan-out-request-explosion/candidate-ui";
import { FAN_OUT_REQUEST_EXPLOSION_SCORING } from "./fan-out-request-explosion/scoring";

/**
 * Fan-Out Request Explosion — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 36). A request-path
 * change widens the product-detail aggregator's fan-out to call all five
 * downstream services on every request. Service A (pricing), Service B
 * (inventory), Service C (shipping estimate), and Service D (tax
 * calculation) are all required for a complete, correct response —
 * Service E (recommendation enrichment) is optional cross-sell content
 * and the response remains complete without it. Under the increased call
 * volume, Service E degrades, and because the aggregator waits on it
 * alongside the four core calls, overall aggregator latency and customer
 * success collapse even though pricing, inventory, shipping, and tax stay
 * healthy on their own. The candidate must recognize that the fastest
 * path to safety may be sacrificing the optional call rather than fixing
 * (or waiting out) a dependency that may be outside their control — and
 * that any mitigation reducing load must be checked against the
 * knock-on pressure it places on the four core dependencies, especially
 * Service A, which has its own bounded capacity shared across the fleet.
 */
export const fanOutRequestExplosion: ScenarioDefinition = {
  id: "fan-out-request-explosion",
  slug: "fan-out-request-explosion",
  version: 1,
  name: "Fan-Out Request Explosion",
  description:
    "A recent request-path change now fans the product-detail request out to all five downstream services instead of a narrower previous set. Pricing, inventory, shipping estimate, and tax calculation are all required for a complete, correct response to the customer. Recommendation enrichment is supplementary cross-sell content — the product page is still complete and correct without it. One of the five downstream services is now responding slowly under the increased call volume, and the aggregator's overall latency and customer success rate are degrading as a result. Diagnose which dependency is actually the constraint, decide what the aggregator can safely do without it, and bring the response path back to a durable, sustainable state without quietly overloading any of the services the response actually depends on.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: fanOutRequestExplosionSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: ["Fan-Out", "Aggregation", "Timeouts", "Partial Responses", "Capacity", "Caching"],
    skills: [
      "Distinguishing core dependencies from optional enrichment in an aggregated response",
      "Recognizing when a mitigation shifts pressure onto a different subsystem",
      "Evaluating timeout and partial-response tradeoffs across parallel downstream calls",
      "Judging whether a recovered customer metric is actually safe to hand back",
    ],
    shortDescription:
      "One of five parallel downstream calls degrades under a new fan-out, and relieving it safely means knowing which dependency is optional and which mitigation quietly pressures a core one.",
  },
};

export {
  fanOutRequestExplosionSimulation,
  fanOutRequestExplosionCandidateUI,
  FAN_OUT_REQUEST_EXPLOSION_SCORING,
  FAN_OUT_CONCURRENCY_LIMIT_KEY,
  ENRICHMENT_CALL_ENABLED_KEY,
  PARTIAL_RESPONSE_POLICY_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  REQUEST_BATCHING_ENABLED_KEY,
  SERVICE_E_TIMEOUT_MS_KEY,
};
