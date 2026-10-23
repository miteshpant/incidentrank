import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  queryLatencyMs: 40,
  dbCpuUtilization: 12,
  scannedRowsPerQuery: 400,
  dbConnectionUtilization: 15,
  apiLatencyMs: 60,
  requestQueueDepth: 0,
  dbStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode) distinguishing WHY the system looks healthy —
  // "indexed" means the order-history query path was actually fixed;
  // "feature-disabled" means the path was simply turned off; "unresolved"
  // means neither has happened yet. Read only by successCondition/
  // acceptableCondition/scoring's dataIntegrity-adjacent measure, never
  // by any scenario-specific scorer code.
  orderHistoryQueryHealth: "unresolved",
};
