import type { ScenarioDefinition } from "./types";
import { paymentRetryStormSimulation } from "./payment-retry-storm/definition";
import { paymentRetryStormScoring } from "./payment-retry-storm/scoring";

export const paymentRetryStorm: ScenarioDefinition = {
  id: "payment-retry-storm",
  slug: "payment-retry-storm",
  version: 1,
  name: "Payment Retry Storm",
  description:
    "A payment provider begins degrading. Existing retry behavior starts amplifying traffic across the system. Diagnose the incident and restore checkout before the failure cascades.",
  difficulty: "senior",
  estimatedMinutes: 20,
  isFree: true,
  simulation: paymentRetryStormSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: ["Retries", "Circuit Breakers", "Backpressure", "Kafka", "Postgres", "Incident Response"],
    skills: [
      "Diagnosing cascading failures",
      "Retry and backoff tuning",
      "Circuit breaker design",
      "Reading cross-service metrics under load",
    ],
    shortDescription:
      "A degrading payment provider triggers a retry storm across checkout, payments, and settlement.",
  },
};

export { paymentRetryStormSimulation, paymentRetryStormScoring };
export * from "./payment-retry-storm/controls";
