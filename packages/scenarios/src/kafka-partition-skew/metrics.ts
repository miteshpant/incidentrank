import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  hotPartitionLagMessages: 150,
  aggregateConsumerUtilization: 45,
  hotPartitionLatencyMs: 120,
  idleConsumerCount: 0,
  partitionStatus: "normal",
  // Phase 6.1: an authoritative, candidate-visible signal for the
  // salted-key-vs-round-robin ordering tradeoff — set directly by
  // whichever recovery rule matches, never inferred from "which
  // strategy was selected" inside the scorer. "preserved" before any
  // skew/mitigation; only a rule that actually changes ordering
  // guarantees sets "degraded".
  orderingMode: "preserved",
};
