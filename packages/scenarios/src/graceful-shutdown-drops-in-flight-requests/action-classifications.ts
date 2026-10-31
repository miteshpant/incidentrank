import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DEPLOY_STRATEGY_KEY,
  DRAIN_TIMEOUT_SECONDS_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
  INSPECT_SHUTDOWN_HOOK_LOGS_KEY,
  REPLICA_COUNT_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_DEPLOY_HISTORY_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: DRAIN_TIMEOUT_SECONDS_KEY,
    valueAtLeast: 15,
    whenTriggerEquals: { deployInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: raise the drain/grace timeout",
      explanation:
        "The shutdown hook never waits for in-flight requests to finish. Raising the pod termination grace period/drain timeout to 15s or more gives in-flight requests time to complete before the pod is killed.",
    },
  },
  {
    controlKey: DEPLOY_STRATEGY_KEY,
    valueEquals: "blue-green",
    whenTriggerEquals: { deployInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: switch to a blue-green rollout",
      explanation:
        "Old pods are never killed until the new generation is fully serving, so in-flight requests on the old generation are never cut off mid-request. Deploys take longer and briefly cost more capacity.",
    },
  },
  {
    controlKey: DEPLOY_STRATEGY_KEY,
    valueEquals: "surge",
    whenTriggerEquals: { deployInProgress: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: switch to a surge rollout",
      explanation:
        "Surging up new pods before tearing down old ones means old pods are never killed while they still hold in-flight requests. Deploys take longer and briefly cost more capacity than a plain rolling deploy.",
    },
  },
  {
    controlKey: REPLICA_COUNT_KEY,
    valueAtLeast: 6,
    whenTriggerEquals: { deployInProgress: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: scaling up replica count",
      explanation:
        "More replicas doesn't change the shutdown hook's behavior — every pod still fails to drain in-flight requests on termination, so the drop rate per deploy stays the same while monthly cost goes up.",
    },
  },
];
