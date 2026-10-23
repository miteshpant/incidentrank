import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CONSUMER_COUNT_KEY,
  EXTERNAL_API_CALL_CONCURRENCY_KEY,
  PRIORITY_ROUTING_ENABLED_KEY,
  PRODUCER_THROTTLE_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every rule carries
 * `feedback` per Phase 6B's mandatory post-incident-feedback requirement
 * (docs/implementation_plan/phase6b.md section 13). Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: CONSUMER_COUNT_KEY,
    valueAtLeast: 4,
    whenTriggerEquals: { producersSurged: true },
    outcome: "beneficial",
    feedback: {
      title: "Scaled consumers to drain the backlog",
      explanation:
        "Adding Kafka consumers genuinely increased how fast the backlog drained and improved event freshness. On its own this is the right first move — but each added consumer also opens its own database connections and makes its own external-API calls, so this relief is only durable if downstream capacity is managed alongside it.",
    },
  },
  {
    id: "acr_2",
    controlKey: PRIORITY_ROUTING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { producersSurged: true },
    outcome: "beneficial",
    feedback: {
      title: "Protected the core path with priority routing",
      explanation:
        "Routing high-priority events through first, and deliberately deferring low-priority ones, kept the shared database and external-API capacity from being split evenly across all traffic. This is what let consumer/worker scaling drain the backlog without the database or external API absorbing all of the new concurrent load.",
    },
  },
  {
    id: "acr_3",
    controlKey: WORKER_CONCURRENCY_KEY,
    valueAtLeast: 40,
    whenTriggerEquals: { producersSurged: true },
    outcome: "harmful",
    feedback: {
      title: "Raised worker concurrency without managing downstream capacity",
      explanation:
        "Higher worker concurrency meant more events processed in parallel per consumer, which also meant more simultaneous database writes per consumer. Without priority routing or a capped external-call concurrency to protect shared downstream capacity, database connection utilization climbed into critical territory — the bottleneck moved from Kafka to the database rather than disappearing.",
    },
  },
  {
    id: "acr_4",
    controlKey: EXTERNAL_API_CALL_CONCURRENCY_KEY,
    valueAtLeast: 60,
    whenTriggerEquals: { producersSurged: true },
    outcome: "harmful",
    feedback: {
      title: "Raised external-call concurrency past what the dependency could sustain",
      explanation:
        "Draining Kafka faster meant more events reaching the external-API call per unit time. Pushed to maximum concurrency without priority routing to shed lower-priority calls, outbound volume exceeded what the external dependency could sustain, and its own rate limiter and error rate climbed — the bottleneck moved from Kafka to the external dependency rather than disappearing.",
    },
  },
  {
    id: "acr_5",
    controlKey: PRODUCER_THROTTLE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { producersSurged: true },
    outcome: "neutral",
    feedback: {
      title: "Throttled ingestion without increasing drain capacity",
      explanation:
        "Throttling producers slowed how fast new events arrived, which can buy time, but it did nothing to increase how fast the processing layer drains the existing backlog. Relied on alone, without also scaling consumer/worker capacity, event freshness stayed elevated for as long as the throttle was the only lever pulled — the symptom was masked, not resolved.",
    },
  },
  {
    id: "acr_6",
    controlKey: CONSUMER_COUNT_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { producersSurged: true },
    outcome: "neutral",
    feedback: {
      title: "Scaled consumers aggressively",
      explanation:
        "A high consumer count drains Kafka lag quickly, but by itself it says nothing about whether the database and external API can absorb that many consumers' worth of concurrent downstream traffic. Whether this was beneficial or harmful overall depended on whether external-call concurrency and priority routing were also managed at the same time.",
    },
  },
];
