import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  APPLICATION_CONCURRENCY_KEY,
  CACHE_NODE_COUNT_KEY,
  CACHE_WARMING_MODE_KEY,
  DB_REQUEST_PROTECTION_KEY,
  FAILOVER_MODE_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping, used only for the operationalEfficiency dimension — never
 * for resolution/rule-matching logic. `feedback` is a post-incident
 * educational explanation only, revealed after a terminal practice
 * attempt (see apps/web/src/lib/server/action-feedback.ts); never read
 * during active play. Ids are stable and intentionally neutral, never
 * self-descriptive of the authored rule logic itself.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: CACHE_NODE_COUNT_KEY,
    valueAtLeast: 4,
    whenTriggerEquals: { cacheNodeDown: true },
    outcome: "beneficial",
    feedback: {
      title: "Replaced the lost cache capacity",
      explanation:
        "Raising the cluster size above its original provisioned level compensated for the node that stayed down, giving the cluster enough live capacity to absorb the redistributed key set without concentrating load onto the remaining nodes.",
    },
  },
  {
    id: "acr_2",
    controlKey: DB_REQUEST_PROTECTION_KEY,
    valueEquals: "coalescing",
    whenTriggerEquals: { cacheNodeDown: true },
    outcome: "beneficial",
    feedback: {
      title: "Collapsed duplicate reads at the database",
      explanation:
        "Request coalescing meant that when many concurrent requests missed on the same key, only one of them actually reached the database — the rest waited on that single read's result instead of each issuing their own.",
    },
  },
  {
    id: "acr_3",
    controlKey: DB_REQUEST_PROTECTION_KEY,
    valueEquals: "rateLimited",
    whenTriggerEquals: { cacheNodeDown: true },
    outcome: "neutral",
    feedback: {
      title: "Shed load instead of absorbing it",
      explanation:
        "Rate limiting protected the database by shedding some fallback reads outright rather than serving them, which kept database-side metrics survivable but did nothing to restore the cache hit rate — the underlying capacity gap was still there, just less visible.",
    },
  },
  {
    id: "acr_4",
    controlKey: CACHE_WARMING_MODE_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { cacheNodeDown: true },
    outcome: "harmful",
    feedback: {
      title: "Cache warming caused its own database spike",
      explanation:
        "Refilling the entire working set as fast as possible issued a burst of near-simultaneous database reads — the same thundering-herd mechanism the incident already created, just self-inflicted through the warming process instead of through organic cache misses.",
    },
  },
  {
    id: "acr_5",
    controlKey: CACHE_WARMING_MODE_KEY,
    valueEquals: "gradual",
    whenTriggerEquals: { cacheNodeDown: true },
    outcome: "beneficial",
    feedback: {
      title: "Refilled the cache without spiking the database",
      explanation:
        "Throttling the refill rate let the cache repopulate its working set over time instead of issuing a burst of simultaneous reads, trading a slower return to full hit rate for avoiding a self-inflicted database spike.",
    },
  },
  {
    id: "acr_6",
    controlKey: APPLICATION_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { cacheNodeDown: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the tier that wasn't the bottleneck",
      explanation:
        "Increasing application concurrency while the database sat unprotected and keys were still falling through to it multiplied the rate of unprotected reads reaching an already-contended database, rather than relieving the actual constraint.",
    },
  },
  {
    id: "acr_7",
    controlKey: FAILOVER_MODE_KEY,
    valueEquals: "originFallback",
    whenTriggerEquals: { cacheNodeDown: true },
    outcome: "neutral",
    feedback: {
      title: "Routed the gap straight to the database",
      explanation:
        "Origin fallback stopped the surviving cache nodes from absorbing the lost node's keys, but it only becomes a safe choice when paired with real database-side read protection — on its own it just moves where the unprotected load lands.",
    },
  },
];
