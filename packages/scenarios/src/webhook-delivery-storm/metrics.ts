import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  webhookBacklog: 20,
  retryVolumePerMinute: 40,
  affectedDestinationFailureRate: 2,
  healthyDestinationDeliveryLatencyMs: 180,
  affectedDestinationDeliveryLatencyMs: 220,
  dispatcherWorkerUtilization: 15,
  dlqDepth: 0,
  dispatcherStatus: "normal",
  // Generic string-state field (precedent: Missing Database Index's
  // orderHistoryQueryHealth, Kafka Partition Skew's orderingMode) naming
  // WHY healthy-destination delivery looks the way it does — "isolated"
  // means the failing subset was contained via per-destination
  // circuit-breaking while the healthy majority kept being dispatched
  // normally (the real fix); "blast-radius" means the failing subset's
  // retries are still consuming shared capacity and degrading delivery
  // to destinations that were never unhealthy; "unresolved" means
  // neither has happened yet. Read only by successCondition/
  // acceptableCondition/scoring, never by any scenario-specific scorer
  // code.
  deliveryIsolationState: "unresolved",
};
