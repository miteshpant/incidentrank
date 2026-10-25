import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DESTINATION_ISOLATION_ENABLED_KEY,
  DISPATCHER_CONCURRENCY_KEY,
  DLQ_ESCALATION_THRESHOLD_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  RETRY_BACKOFF_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement. Ids are stable and intentionally neutral, never
 * self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: DESTINATION_ISOLATION_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { destinationsDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Scoped retries to the failing subset",
      explanation:
        "Isolating the affected destinations let the dispatcher short-circuit retries against them on their own, without touching how it dispatched to everyone else. Healthy-destination delivery latency stayed close to its pre-incident baseline the whole time, because the failing subset's retries stopped competing for the same shared worker/queue capacity. This is the one change that addresses the actual shared-resource mechanism rather than reducing how much damage it does.",
    },
  },
  {
    id: "acr_2",
    controlKey: DISPATCHER_CONCURRENCY_KEY,
    valueAtLeast: 200,
    whenTriggerEquals: { destinationsDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Gave the retry storm more room to run",
      explanation:
        "Raising dispatcher concurrency added more shared in-flight delivery slots, but the failing destination subset's retries were still unbounded and un-isolated — they simply filled the extra slots too. Healthy-destination delivery latency got worse, not better, because more of the shared pool was now occupied by attempts against endpoints that weren't going to succeed.",
    },
  },
  {
    id: "acr_3",
    controlKey: WORKER_COUNT_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { destinationsDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Added workers to a queue, not a capacity problem",
      explanation:
        "More dispatcher workers pull from the same shared delivery queue. Without isolation, each additional worker just became another independent source of blocked retry attempts against the unreachable destination subset, starving healthy deliveries of worker time rather than relieving it.",
    },
  },
  {
    id: "acr_4",
    controlKey: MAX_RETRY_ATTEMPTS_KEY,
    valueAtLeast: 999,
    whenTriggerEquals: { destinationsDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Let failing deliveries retry forever",
      explanation:
        "Removing the retry ceiling meant every failed delivery to the unreachable subset kept re-entering the shared retry pool indefinitely instead of eventually giving up. Backlog and retry volume grew without bound, deepening the pressure on shared worker capacity that healthy destinations also depend on.",
    },
  },
  {
    id: "acr_5",
    controlKey: RETRY_BACKOFF_KEY,
    valueEquals: "exponential",
    whenTriggerEquals: { destinationsDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Spread the storm out without containing it",
      explanation:
        "Exponential backoff reduced how many retries against the failing subset landed at the same instant, which measurably eased pressure on the shared pool and improved healthy-destination latency from baseline. But the failing subset's retries were still indefinite and still shared the same pool as everyone else — this reduced the blast radius without eliminating it.",
    },
  },
  {
    id: "acr_6",
    controlKey: DLQ_ESCALATION_THRESHOLD_KEY,
    valueAtMost: 20,
    whenTriggerEquals: { destinationsDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Gave up on failing deliveries sooner, not differently",
      explanation:
        "Tightening the dead-letter threshold capped how many times a failing delivery could occupy a shared worker slot before being parked for later inspection, which limited (but did not stop) backlog growth. Deliveries to the affected subset still competed for the same shared pool up to that point, so healthy-destination latency stayed degraded rather than recovering.",
    },
  },
];
