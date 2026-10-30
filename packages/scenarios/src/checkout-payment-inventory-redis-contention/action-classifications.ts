import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  INSPECT_PAYMENT_METRICS_KEY,
  INSPECT_INVENTORY_DEPLOYS_KEY,
  INSPECT_REDIS_CONNECTIONS_KEY,
  REDIS_CONNECTION_POOL_KEY,
  RESTART_PAYMENT_PODS_KEY,
  ROLLBACK_INVENTORY_DEPLOY_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_PAYMENT_METRICS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_INVENTORY_DEPLOYS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_REDIS_CONNECTIONS_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: REDIS_CONNECTION_POOL_KEY,
    valueAtLeast: 512,
    whenTriggerEquals: { redisContending: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: Redis connection pool capacity",
      explanation:
        "Payment and Inventory share the same Redis connection pool. Raising the pool size to 512 or more relieves the contention both services were independently blocked on.",
    },
  },
  {
    controlKey: RESTART_PAYMENT_PODS_KEY,
    valueEquals: true,
    whenTriggerEquals: { redisContending: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting Payment pods",
      explanation:
        "Restarting Payment's pods briefly clears its own connection backlog, but the shared Redis pool is still saturated — Inventory stays degraded and Payment relapses as soon as traffic resumes.",
    },
  },
  {
    controlKey: ROLLBACK_INVENTORY_DEPLOY_KEY,
    valueEquals: true,
    whenTriggerEquals: { redisContending: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but unrelated: rolling back the Inventory deploy",
      explanation:
        "The Inventory deploy was never the cause of this incident — rolling it back does nothing to relieve the Redis connection pressure that's actually driving Inventory's elevated latency.",
    },
  },
];
