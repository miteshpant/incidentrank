import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BATCH_SIZE_KEY,
  CONSUMER_B_CONCURRENCY_KEY,
  CONSUMER_C_RETRY_MODE_KEY,
  DLQ_POLICY_KEY,
  DOWNSTREAM_CIRCUIT_BREAKER_KEY,
  PARTITION_ISOLATION_KEY,
  PRODUCER_BACKPRESSURE_KEY,
  TOPIC_A_PRIORITY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` describing the system consequence, including
 * which pressure moved where and any historical damage incurred or
 * avoided. Ids are stable and intentionally neutral.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: PARTITION_ISOLATION_KEY,
    valueEquals: "unisolated",
    whenTriggerEquals: { brokerPartitionDegraded: true, consumerCRetryStorm: true },
    outcome: "harmful",
    feedback: {
      title: "Left the degraded partition class unisolated under heavy load",
      explanation:
        "With the broker partition class still unisolated, its replication contention can bleed into Topic A's own (otherwise healthy) partition class once batch sizes are large and Consumer Group C's retry volume is high. If that combination holds, Topic A — the durability-critical topic — starts dropping events for real. Those drops are historical: fixing the configuration afterward stops new drops but never un-drops what already happened.",
    },
  },
  {
    id: "acr_2",
    controlKey: PARTITION_ISOLATION_KEY,
    valueEquals: "isolated",
    whenTriggerEquals: { brokerPartitionDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Isolated the degraded broker partition class",
      explanation:
        "Isolating the degraded partition class fences its replication/ISR contention away from Topic A's healthy partition class and the rest of the broker cluster. This protects Topic A's durability regardless of what batch size or retry pressure Consumer Group C is generating, and lets the degraded class itself begin draining its own replication backlog once given real elapsed recovery time.",
    },
  },
  {
    id: "acr_3",
    controlKey: BATCH_SIZE_KEY,
    valueEquals: 2_000,
    whenTriggerEquals: { brokerPartitionDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Raised batch size while the broker partition class is degraded",
      explanation:
        "Large batches hold the degraded partition class's replication path open longer per request, worsening broker pressure at exactly the moment that partition class is already degraded — and, combined with an unisolated configuration and Consumer Group C's retry storm, this is one of the two conditions that lets contention bleed into Topic A's durability.",
    },
  },
  {
    id: "acr_4",
    controlKey: CONSUMER_B_CONCURRENCY_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { consumerBLagging: true, consumerCRetryStorm: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled Consumer Group B's concurrency while Group C's retries stayed unmanaged",
      explanation:
        "Raising Consumer Group B's concurrency this far does genuinely drain Group B's own lag — but every added consumer instance also writes to the same shared downstream DB/API that Consumer Group C is already hammering with unbounded retries. downstreamHealthPct gets measurably WORSE than if nothing had been touched at all, because two consumer groups are now contending for capacity nobody protected. Consumer Group B's lag problem and the downstream dependency's health are not the same problem — fixing one by brute force can directly damage the other.",
    },
  },
  {
    id: "acr_5",
    controlKey: CONSUMER_B_CONCURRENCY_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { consumerBLagging: true },
    outcome: "beneficial",
    feedback: {
      title: "Raised Consumer Group B's concurrency to a level that genuinely drains its lag",
      explanation:
        "This concurrency level is enough to let Consumer Group B actually catch up on Topic B's backlog over real elapsed time, without being the aggressive over-scale that floods the shared downstream DB/API on top of whatever load Consumer Group C is separately generating.",
    },
  },
  {
    id: "acr_6",
    controlKey: CONSUMER_C_RETRY_MODE_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { consumerCRetryStorm: true },
    outcome: "harmful",
    feedback: {
      title: "Left Consumer Group C retrying aggressively against the degraded downstream",
      explanation:
        "Aggressive, unbounded retries from Consumer Group C keep hammering a downstream DB/API that is already degraded, preventing it from ever recovering and directly driving downstreamHealthPct down. This retry-ownership decision belongs to Group C specifically — it has no effect on the broker partition problem or Group B's own lag, and nothing done to those two subsystems substitutes for fixing this one.",
    },
  },
  {
    id: "acr_7",
    controlKey: CONSUMER_C_RETRY_MODE_KEY,
    valueEquals: "circuit-breaker",
    whenTriggerEquals: { consumerCRetryStorm: true },
    outcome: "beneficial",
    feedback: {
      title: "Switched Consumer Group C to circuit-breaker retry mode",
      explanation:
        "Stopping new calls once the downstream DB/API's own error rate is already elevated gives it real room to recover, rather than continuing to add retry load on top of a dependency that cannot currently absorb it. This directly targets the retry-storm root cause without touching the broker or Consumer Group B's configuration at all.",
    },
  },
  {
    id: "acr_8",
    controlKey: CONSUMER_C_RETRY_MODE_KEY,
    valueEquals: "bounded",
    whenTriggerEquals: { consumerCRetryStorm: true },
    outcome: "neutral",
    feedback: {
      title: "Bounded Consumer Group C's retry attempts",
      explanation:
        "Bounding retries stops the unbounded redelivery loop against the degraded downstream, which is a genuine improvement over leaving retries aggressive. On its own, without the DLQ enabled, events that exhaust their bounded retry budget currently have nowhere safe to go — pair this with enabling the DLQ policy to make this a fully safe fix rather than a trade of one failure mode for another.",
    },
  },
  {
    id: "acr_9",
    controlKey: DLQ_POLICY_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { consumerCRetryStorm: true },
    outcome: "harmful",
    feedback: {
      title: "Left the dead-letter queue disabled while bounding Consumer Group C's retries",
      explanation:
        "Bounding retries without a DLQ to catch genuinely-exhausted events means those events are effectively discarded once they exhaust their retry budget rather than being durably preserved for later reprocessing — a direct violation of 'dropping events merely to reduce lag is not acceptable,' even though dropping the retry rate itself looks like progress on the dashboard.",
    },
  },
  {
    id: "acr_10",
    controlKey: DLQ_POLICY_KEY,
    valueEquals: "enabled",
    whenTriggerEquals: { consumerCRetryStorm: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled the dead-letter queue for genuinely-exhausted events",
      explanation:
        "Events that truly exhaust their retry budget now route to a durable DLQ for later reprocessing instead of being discarded — preserving every event while still letting the live retry/queue pressure against the degraded downstream drain.",
    },
  },
  {
    id: "acr_12",
    controlKey: TOPIC_A_PRIORITY_KEY,
    valueEquals: "protected",
    whenTriggerEquals: { brokerPartitionDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Reserved broker capacity ahead of Topic B/Topic C for Topic A",
      explanation:
        "Declaring Topic A's priority reserves broker capacity for it ahead of Topic B and Topic C. This is real defense-in-depth — if the degraded partition class's contention ever does threaten to spill over, Topic A's durability loss is substantially reduced versus having no protection at all — but it is not a substitute for actually isolating the degraded partition class: some contention can still reach Topic A if isolation is never applied.",
    },
  },
  {
    id: "acr_11",
    controlKey: DOWNSTREAM_CIRCUIT_BREAKER_KEY,
    valueEquals: true,
    whenTriggerEquals: { consumerCRetryStorm: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled the downstream circuit breaker",
      explanation:
        "Capping aggregate outbound call concurrency into the downstream DB/API across every consumer group — independent of any single group's own retry mode — protects the dependency directly and complements (rather than replaces) fixing Consumer Group C's retry ownership.",
    },
  },
  {
    id: "acr_13",
    controlKey: PRODUCER_BACKPRESSURE_KEY,
    valueEquals: true,
    whenTriggerEquals: { brokerPartitionDegraded: true, consumerBLagging: true, consumerCRetryStorm: true },
    outcome: "neutral",
    feedback: {
      title: "Enabled producer backpressure — a calmer dashboard, not a fix",
      explanation:
        "Throttling ingestion at the Event Gateway genuinely reduces load reaching the degraded broker partition class — brokerPartitionHealth and topicBBacklogMessages both read measurably better than doing nothing. But this is a producer-side lever with zero reach into Consumer Group B's own processing lag or Consumer Group C's retry storm against the downstream — both remain exactly as critical as the unmitigated baseline. Treating the calmer broker metrics as evidence the incident is under control, while Group B's lag and the downstream dependency's health are untouched, is exactly the masking trap this control exists to test.",
    },
  },
];
