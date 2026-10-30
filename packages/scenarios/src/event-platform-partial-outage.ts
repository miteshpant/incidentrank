import type { ScenarioDefinition } from "./types";
import {
  eventPlatformPartialOutageSimulation,
  BATCH_SIZE_KEY,
  CONSUMER_B_CONCURRENCY_KEY,
  CONSUMER_C_RETRY_MODE_KEY,
  DLQ_POLICY_KEY,
  DOWNSTREAM_CIRCUIT_BREAKER_KEY,
  PARTITION_ISOLATION_KEY,
  PRODUCER_BACKPRESSURE_KEY,
  TOPIC_A_PRIORITY_KEY,
} from "./event-platform-partial-outage/definition";
import { eventPlatformPartialOutageCandidateUI } from "./event-platform-partial-outage/candidate-ui";
import { EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING } from "./event-platform-partial-outage/scoring";

/**
 * Event Platform Partial Outage — a paid, Senior-Staff-level
 * IncidentRank scenario (docs/implementation_plan/phase6d.2.md,
 * scenario 68). Three genuinely independent problems start within the
 * same narrow window: one broker partition class (the class backing
 * Topic B and Topic C — Topic A's partitions sit on a separate,
 * healthy class) becomes degraded; Consumer Group B develops growing
 * lag against Topic B from its own processing path; and Consumer
 * Group C begins retrying aggressively against its independently
 * degraded downstream DB/API. Overall broker health reads ambiguous
 * rather than cleanly down. The candidate must separate the broker
 * problem, the consumer problem, and the downstream problem, and act
 * on each independently — this must never collapse into "just add
 * consumers": naively scaling Consumer Group B's concurrency while
 * Consumer Group C is still hammering the shared downstream in
 * unmanaged retry mode measurably worsens the already-degraded
 * downstream dependency, even though Group B's own lag number looks
 * great afterward.
 *
 * Four business invariants govern every decision here: (1) critical
 * Topic A events must remain durable; (2) lower-priority Topic C
 * events may be delayed; (3) no consumer group may be allowed to
 * destabilize unrelated topics; (4) dropping events merely to reduce
 * lag is not acceptable. If the broker partition class is ever left
 * unisolated under heavy batch load while Consumer Group C's retry
 * storm is active for long enough, that contention bleeds into Topic
 * A's own partition class and real, durable Topic A events are
 * dropped — a historical loss that persists for the rest of the
 * incident even after the live configuration is corrected, because
 * fixing the configuration stops new drops but can never retroactively
 * restore events that are already gone.
 */
export const eventPlatformPartialOutage: ScenarioDefinition = {
  id: "event-platform-partial-outage",
  slug: "event-platform-partial-outage",
  version: 1,
  name: "Event Platform Partial Outage",
  description:
    "Three genuinely independent problems begin within the same narrow window: one broker partition class — the class backing Topic B and Topic C, not Topic A, whose partitions sit on a separate, currently-healthy partition class — becomes degraded; Consumer Group B develops growing lag against Topic B from a slow pattern inside its own processing path; and Consumer Group C begins retrying aggressively against its own, independently degraded downstream DB/API. Overall broker health reads ambiguous rather than cleanly down. You must diagnose and act on the broker problem, the consumer problem, and the downstream problem independently — this must never collapse into 'just add consumers': naively scaling Consumer Group B's concurrency while Consumer Group C is still hammering the shared downstream in unmanaged retry mode measurably worsens the already-degraded downstream dependency, even though Consumer Group B's own lag number will look great immediately afterward. Four business invariants govern every decision: (1) critical Topic A events must remain durable; (2) lower-priority Topic C events may be delayed; (3) no consumer group may be allowed to destabilize unrelated topics; (4) dropping events merely to reduce lag is not acceptable. If the degraded broker partition class is ever left unisolated under heavy batch load while Consumer Group C's retry storm is active for long enough, that contention bleeds into Topic A's own partition class and real, durable Topic A events are dropped — a historical loss that persists for the rest of the incident even after the live configuration is corrected, because fixing the configuration stops new drops but can never retroactively restore events that are already gone.",
  difficulty: "senior_staff",
  estimatedMinutes: 22,
  isFree: false,
  structure: "linear",
  simulation: eventPlatformPartialOutageSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: [
      "Kafka",
      "Event Streaming",
      "Consumer Groups",
      "Pressure Transfer",
      "Durability",
      "Retry Ownership",
    ],
    skills: [
      "Separating simultaneous, independently-caused failure domains instead of treating them as one incident",
      "Recognizing when a mitigation that fixes one subsystem's metric worsens an unrelated shared dependency",
      "Protecting a durability-critical topic from unrelated broker/consumer contention",
      "Distinguishing retry ownership, downstream protection, and consumer-lag remediation as separate levers",
    ],
    shortDescription:
      "A degraded broker partition class, a lagging consumer group, and a retry storm against a degraded downstream all hit at once — scaling consumers alone transfers pressure downstream instead of fixing anything.",
  },
};

export {
  eventPlatformPartialOutageSimulation,
  eventPlatformPartialOutageCandidateUI,
  EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING,
  BATCH_SIZE_KEY,
  CONSUMER_B_CONCURRENCY_KEY,
  CONSUMER_C_RETRY_MODE_KEY,
  DLQ_POLICY_KEY,
  DOWNSTREAM_CIRCUIT_BREAKER_KEY,
  PARTITION_ISOLATION_KEY,
  PRODUCER_BACKPRESSURE_KEY,
  TOPIC_A_PRIORITY_KEY,
};
