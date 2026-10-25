import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  writeThroughputPerSec: 1_200,
  writeAcceptanceRate: 100,
  replicationLagMs: 400,
  replicaApplyRatePerSec: 1_200,
  staleReadAgeMs: 350,
  networkPressure: 20,
  storagePressure: 15,
  primaryStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode, Missing Database Index's
  // orderHistoryQueryHealth) distinguishing WHY replication looks
  // caught-up — "throughput-matched" means the primary's write
  // acceptance was actually brought back in line with sustainable
  // replication capacity (the durable fix); "reads-isolated" means
  // consistency risk was removed only by routing fresh-read traffic to
  // the primary while the backlog itself was never cleared; "backlogged"
  // means neither has happened. Read only by successCondition/
  // acceptableCondition/scoring's dataIntegrity measure, never by any
  // scenario-specific scorer code.
  replicationHealth: "throughput-matched",
};
