import type { ScenarioDefinition } from "./types";
import {
  webhookDeliveryStormSimulation,
  DESTINATION_ISOLATION_ENABLED_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  RETRY_BACKOFF_KEY,
  DISPATCHER_CONCURRENCY_KEY,
  WORKER_COUNT_KEY,
  DLQ_ESCALATION_THRESHOLD_KEY,
} from "./webhook-delivery-storm/definition";
import { webhookDeliveryStormCandidateUI } from "./webhook-delivery-storm/candidate-ui";
import { WEBHOOK_DELIVERY_STORM_SCORING } from "./webhook-delivery-storm/scoring";

/**
 * Webhook Delivery Storm — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 50, API & Traffic
 * Management). A common downstream provider used by a subset of
 * customer webhook receivers goes down, so a meaningful slice of
 * delivery destinations become slow or unreachable at the same time.
 * Because the dispatcher's retry queue and worker pool are shared
 * across every destination, aggressive uncontained retries against the
 * failing subset can consume enough of that shared capacity to slow
 * delivery to destinations that were never unhealthy in the first
 * place. The candidate must recognize that the durable fix scopes
 * containment to the failing destinations specifically, not add more
 * shared dispatcher capacity for the same unbounded retry storm to
 * occupy.
 */
export const webhookDeliveryStorm: ScenarioDefinition = {
  id: "webhook-delivery-storm",
  slug: "webhook-delivery-storm",
  version: 1,
  name: "Webhook Delivery Storm",
  description:
    "A provider shared by a meaningful subset of your customers' webhook receivers has gone down, and deliveries to that subset are now failing or timing out. All customer destinations — healthy and affected alike — are served by the same dispatcher worker pool and retry queue. Every customer's webhook feed is business-critical to them individually, and destinations outside the affected subset have done nothing wrong. Diagnose why delivery is degrading even for customers whose endpoints are fully healthy, and bring the dispatcher back to a durable, sustainable state without leaving the platform unable to tell a transient blip from a genuine outage.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: webhookDeliveryStormSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Webhooks", "Retries", "Circuit Breakers", "Multi-Tenancy", "Backpressure"],
    skills: [
      "Diagnosing shared-resource contention across independent destinations",
      "Scoping circuit breakers/isolation to the actual failing subset",
      "Recognizing when adding shared capacity doesn't contain a retry storm",
      "Weighing backoff and dead-lettering as partial versus structural fixes",
    ],
    shortDescription:
      "A shared downstream outage is making a subset of customer webhook endpoints unreachable, and uncontained retries against them are degrading delivery to everyone else too.",
  },
};

export {
  webhookDeliveryStormSimulation,
  webhookDeliveryStormCandidateUI,
  WEBHOOK_DELIVERY_STORM_SCORING,
  DESTINATION_ISOLATION_ENABLED_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  RETRY_BACKOFF_KEY,
  DISPATCHER_CONCURRENCY_KEY,
  WORKER_COUNT_KEY,
  DLQ_ESCALATION_THRESHOLD_KEY,
};
