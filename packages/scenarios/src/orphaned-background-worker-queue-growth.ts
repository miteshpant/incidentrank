import type { ScenarioDefinition } from "./types";
import {
  orphanedBackgroundWorkerQueueGrowthSimulation,
  INSPECT_WORKER_LOGS_KEY,
  INSPECT_DEPLOY_DIFF_KEY,
  INSPECT_QUEUE_DEPTH_KEY,
  ROLLBACK_WORKER_DEPLOY_KEY,
  RESTART_WORKER_PODS_KEY,
  WORKER_CONCURRENCY_KEY,
  PAUSE_PRODUCERS_KEY,
} from "./orphaned-background-worker-queue-growth/definition";
import { orphanedBackgroundWorkerQueueGrowthCandidateUI } from "./orphaned-background-worker-queue-growth/candidate-ui";
import { ORPHANED_BACKGROUND_WORKER_QUEUE_GROWTH_SCORING } from "./orphaned-background-worker-queue-growth/scoring";

/**
 * Staff-level "parallel" structured incident: a worker deploy ships a bad
 * environment variable, every worker pod crash-loops on startup, and
 * active consumer count drops to zero while producers keep publishing
 * normally — queue depth grows without bound. Consumers here are fully
 * DEAD (not slow, not poisoned by a bad message like
 * dead-letter-queue-explosion, not thrashing through rebalance cycles
 * like consumer-rebalance-storm) — zero consumers are attached to the
 * queue at all.
 *
 * The incident is genuinely parallel, not just flavor text: fixing the
 * deploy (Track A) and draining the accumulated backlog (Track B) are two
 * independent problems. Rolling back the deploy alone brings workers back
 * online but leaves a large backlog to drain slowly at normal throughput.
 * Raising worker concurrency alone does nothing while there are still
 * zero healthy consumers attached. Both tracks must be completed,
 * concurrently, for the incident to actually resolve.
 */
export const orphanedBackgroundWorkerQueueGrowth: ScenarioDefinition = {
  id: "orphaned-background-worker-queue-growth",
  slug: "orphaned-background-worker-queue-growth",
  version: 1,
  name: "Orphaned Background Worker Queue Growth",
  description:
    "A deploy just went out to the background worker fleet. Producers are publishing normally, but the job queue is growing without bound — active consumer count has dropped to zero. The worker pods are crash-looping on a bad environment variable baked into the new deploy. Fixing the deploy and draining the backlog that built up while workers were dead are two genuinely independent problems; you need to solve both.",
  difficulty: "staff",
  estimatedMinutes: 16,
  isFree: false,
  structure: "parallel",
  simulation: orphanedBackgroundWorkerQueueGrowthSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Queues", "Background Workers", "Deploys", "Consumer Lag", "Crash Loop"],
    primarySkill: "Diagnosing a fully dead consumer fleet and separately draining its backlog",
    skills: [
      "Distinguishing a dead consumer from a slow or poisoned one",
      "Recognizing that a bad deploy and an accumulated backlog are two independent problems",
      "Reading zero active consumers as the root cause, not restart count alone",
      "Avoiding a plausible-but-incomplete single-track remediation",
    ],
    shortDescription:
      "Worker pods crash-loop on a bad deploy and consumer count hits zero — queue depth grows unbounded until both the deploy and the backlog are fixed.",
  },
};

export {
  orphanedBackgroundWorkerQueueGrowthSimulation,
  orphanedBackgroundWorkerQueueGrowthCandidateUI,
  ORPHANED_BACKGROUND_WORKER_QUEUE_GROWTH_SCORING,
  INSPECT_WORKER_LOGS_KEY,
  INSPECT_DEPLOY_DIFF_KEY,
  INSPECT_QUEUE_DEPTH_KEY,
  ROLLBACK_WORKER_DEPLOY_KEY,
  RESTART_WORKER_PODS_KEY,
  WORKER_CONCURRENCY_KEY,
  PAUSE_PRODUCERS_KEY,
};
