import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Broker health status for the degraded partition class, 0-100 (100 =
  // fully healthy). Degrades when the root-cause broker problem is
  // active and unisolated; recovers only once the partition class is
  // isolated AND given real elapsed recovery time (see rules.ts /
  // timed-events.ts).
  brokerPartitionHealth: 100,
  // Topic A's own durability/write success rate, 0-100. Topic A must
  // stay at or near 100 throughout — this is the scenario's protected
  // invariant metric.
  topicADurabilityPct: 100,
  // Cumulative, HISTORICAL count of Topic A events ever dropped. This
  // is the historical-damage counter: it only ever increases while a
  // genuine Topic-A-drop condition is active, and it never resets to
  // zero just because the live configuration is later fixed — a
  // candidate who allows even one drop carries that count for the rest
  // of the attempt (see rules.ts and the completion-mode audit in
  // definition.ts).
  topicAEventsDroppedTotal: 0,
  // Consumer Group B's lag, in messages. Climbs while Group B cannot
  // keep up with Topic B's write rate; drains gradually (never
  // instantly) once genuine concurrency relief is applied and enough
  // real elapsed time has passed.
  consumerBLagMessages: 200,
  // Consumer Group B's processing status, a severity-like field.
  consumerBStatus: "normal",
  // Consumer Group C's retry rate against the downstream DB/API,
  // retries per minute. Climbs under the retry storm; only stops
  // climbing once retry ownership is actually changed (bounded or
  // circuit-breaker), never by merely adding capacity elsewhere.
  consumerCRetryRatePerMinute: 20,
  // The downstream DB/API's own health as seen by all three consumer
  // groups collectively, 0-100. This is the shared pressure-transfer
  // target: any consumer group's unmanaged concurrency/retries can push
  // this down, independent of which group caused the original problem.
  downstreamHealthPct: 100,
  // Cumulative, HISTORICAL count of events routed to the DLQ because
  // their retry budget was exhausted. This only grows while a bounded
  // retry policy is active without a corresponding DLQ, or while a
  // genuinely-exhausted event has nowhere safe to go; it is a backlog
  // of real, durable-but-unprocessed work, not a self-resetting gauge.
  dlqBacklogCount: 0,
  // Topic B's own backlog depth in messages (mirrors consumerBLagMessages
  // in effect, but represents un-consumed broker-side storage pressure
  // distinct from strict lag accounting).
  topicBBacklogMessages: 150,
  // The overall event-platform incident classification. Consumed by
  // scoring as a generic string-state measure.
  platformStatus: "normal",
};
