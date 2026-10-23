import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  dlqDepth: 20,
  dlqGrowthRatePerMin: 0,
  mainQueueLagMessages: 50,
  processingErrorRate: 1,
  replayThroughputPerMin: 0,
  duplicateProcessingRiskScore: 0,
  consumerStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode, Missing Database Index's orderHistoryQueryHealth)
  // tracking the correctness trap this scenario exists to test: "intact"
  // means every event that entered the DLQ is still recoverable;
  // "eventsPurged" means the DLQ was discarded and some genuinely
  // recoverable events are now gone forever. Read only by
  // successCondition/failureCondition/scoring's dataIntegrity measure,
  // never by any scenario-specific scorer code.
  dataLossState: "intact",
  // Numeric companion to dataLossState: the count of events permanently
  // lost. Zero and only zero while dataLossState === "intact"; the
  // instant the DLQ is discarded this becomes nonzero and NEVER returns
  // to zero for the rest of the attempt, modeling irreversible data
  // loss rather than a transient symptom any later action could clear.
  eventsPermanentlyLost: 0,
};
