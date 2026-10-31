import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DB_POOL_MAX_SIZE_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_POOL_CONFIG_KEY,
  INSPECT_TRAFFIC_GRAPHS_KEY,
  RESTART_API_PODS_KEY,
  SCALE_API_REPLICAS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_DEPLOY_HISTORY_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_TRAFFIC_GRAPHS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_POOL_CONFIG_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: DB_POOL_MAX_SIZE_KEY,
    valueAtLeast: 100,
    whenTriggerEquals: { poolStarving: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: restore the connection pool ceiling",
      explanation:
        "A deploy silently dropped DB_POOL_MAX_SIZE's default from 100 to 10. Traffic never surged — restoring the pool ceiling to 100 or more is what actually relieves the starvation.",
    },
  },
  {
    controlKey: RESTART_API_PODS_KEY,
    valueEquals: true,
    whenTriggerEquals: { poolStarving: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting API pods",
      explanation:
        "Restarting clears each pod's held connections momentarily, but the pool ceiling itself is still far too small for normal traffic — the queue rebuilds within moments.",
    },
  },
  {
    controlKey: SCALE_API_REPLICAS_KEY,
    valueEquals: true,
    whenTriggerEquals: { poolStarving: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but unrelated: scaling out API replicas",
      explanation:
        "Adding replicas is the right instinct for demand-driven saturation, but this incident's traffic never grew — more pods just means more concurrent requests against the same undersized 10-connection ceiling.",
    },
  },
];
