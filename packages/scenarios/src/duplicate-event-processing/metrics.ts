import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  consumerThroughputPerSec: 420,
  ackFailureRatePct: 1,
  redeliveryVolumePerMin: 8,
  duplicateEventRatePct: 0,
  // Real, observable correctness counters — climb under sustained
  // redelivery UNLESS idempotent processing is genuinely enabled. Never
  // reset by a control that merely looks helpful (concurrency, faster
  // acking, more retries) — only recognizing-and-skipping a duplicate
  // event actually holds these at zero.
  duplicateOrderCount: 0,
  duplicatePaymentCount: 0,
  brokerStatus: "normal",
  // Generic string-state field (Kafka Partition Skew / Missing Database
  // Index precedent) distinguishing WHY the final state looks the way it
  // does, read only by successCondition/acceptableCondition/scoring's
  // dataIntegrity measure — never by any scenario-specific scorer code.
  // "unresolved": incident ongoing or never mitigated.
  // "unsafe-duplicating": throughput/ack metrics may look healthy but
  //   duplicate side effects are still being produced.
  // "safe-deduplicated": idempotent processing + a real dedup window are
  //   both in effect, so redelivered events are recognized and skipped.
  duplicateSafetyStatus: "unresolved",
};
