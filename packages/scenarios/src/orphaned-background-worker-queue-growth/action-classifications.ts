import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  INSPECT_WORKER_LOGS_KEY,
  INSPECT_DEPLOY_DIFF_KEY,
  INSPECT_QUEUE_DEPTH_KEY,
  ROLLBACK_WORKER_DEPLOY_KEY,
  RESTART_WORKER_PODS_KEY,
  WORKER_CONCURRENCY_KEY,
  PAUSE_PRODUCERS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_WORKER_LOGS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_DEPLOY_DIFF_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_QUEUE_DEPTH_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: ROLLBACK_WORKER_DEPLOY_KEY,
    valueEquals: true,
    whenTriggerEquals: { workersDead: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix, Track A: roll back the bad worker deploy",
      explanation:
        "The latest worker deploy shipped a bad environment variable that makes every worker pod crash-loop on startup. Rolling it back is the only action that brings a single healthy consumer back online.",
    },
  },
  {
    controlKey: WORKER_CONCURRENCY_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { workersDead: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix, Track B: raise worker concurrency to drain the backlog",
      explanation:
        "Producers never stopped publishing while consumers were dead, so a large backlog built up. Once workers are healthy again, raising concurrency is what actually clears that backlog quickly instead of draining it at normal throughput for a long time.",
    },
  },
  {
    controlKey: RESTART_WORKER_PODS_KEY,
    valueEquals: true,
    whenTriggerEquals: { workersDead: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting worker pods",
      explanation:
        "Restarting the pods looks like it should help, but the crash is caused by a bad environment variable baked into the new deploy, not a stuck process — the new pods boot with the exact same broken configuration and crash-loop again almost immediately.",
    },
  },
  {
    controlKey: PAUSE_PRODUCERS_KEY,
    valueEquals: true,
    whenTriggerEquals: { workersDead: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but incomplete: pausing producers",
      explanation:
        "Pausing producers stops the queue from growing any further, but it does not drain a single already-enqueued job and does nothing about the dead consumers that caused the backlog in the first place.",
    },
  },
];
