import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  kafkaLagMessages: 400,
  processingThroughputPerSec: 180,
  eventFreshnessSeconds: 4,
  dbConnectionUtilization: 18,
  externalApiErrorRate: 1,
  kafkaStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode, Missing Database Index's orderHistoryQueryHealth)
  // tracking WHICH subsystem, if any, absorbed the transferred pressure —
  // "balanced" means ingestion/processing/DB/external-API capacity were
  // brought back into proportion; "database-overloaded" and
  // "external-api-overloaded" mean a mitigation relieved Kafka lag only by
  // pushing the bottleneck downstream; "unresolved" means the incident is
  // still ongoing. Read only by successCondition/scoring, never by any
  // scenario-specific scorer code.
  downstreamPressure: "unresolved",
};
