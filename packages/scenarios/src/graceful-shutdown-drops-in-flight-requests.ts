import type { ScenarioDefinition } from "./types";
import {
  gracefulShutdownDropsInFlightRequestsSimulation,
  INSPECT_SHUTDOWN_HOOK_LOGS_KEY,
  INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  DRAIN_TIMEOUT_SECONDS_KEY,
  DEPLOY_STRATEGY_KEY,
  REPLICA_COUNT_KEY,
} from "./graceful-shutdown-drops-in-flight-requests/definition";
import { gracefulShutdownDropsInFlightRequestsCandidateUI } from "./graceful-shutdown-drops-in-flight-requests/candidate-ui";
import { GRACEFUL_SHUTDOWN_DROPS_IN_FLIGHT_REQUESTS_SCORING } from "./graceful-shutdown-drops-in-flight-requests/scoring";

/**
 * A rolling deploy's shutdown hook never waits for in-flight requests to
 * finish before the process is killed — not a capacity problem, a
 * lifecycle/drain-timing bug. Every deploy drops a steady trickle of
 * requests regardless of how many replicas are running, because every
 * pod independently fails to drain on termination. The candidate has two
 * legitimately correct remediation paths with different tradeoffs:
 * raise the per-pod drain/grace timeout (deploys get a little slower,
 * cost is unaffected), or switch the rollout strategy to surge/blue-
 * green (deploys take meaningfully longer and briefly cost more, but old
 * pods are never killed until new ones are already serving). Scaling up
 * replica count is the plausible-but-inferior instinct: more pods, same
 * per-pod shutdown bug, same drop rate, higher cost for nothing.
 */
export const gracefulShutdownDropsInFlightRequests: ScenarioDefinition = {
  id: "graceful-shutdown-drops-in-flight-requests",
  slug: "graceful-shutdown-drops-in-flight-requests",
  version: 1,
  name: "Graceful Shutdown Drops In-Flight Requests",
  description:
    "Every rolling deploy drops a steady trickle of checkout requests. Replica count looks fine, CPU looks fine — but pods are being killed before their in-flight requests finish, because the shutdown hook never waits for them to drain. Diagnose the lifecycle bug and choose a fix: a faster drain timeout, or a slower, safer deploy strategy.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  structure: "branching",
  simulation: gracefulShutdownDropsInFlightRequestsSimulation,
  library: {
    category: "Infrastructure & Capacity",
    tags: ["Deploys", "Graceful Shutdown", "Kubernetes", "Request Draining", "Rollout Strategy"],
    primarySkill: "Diagnosing lifecycle/drain-timing bugs distinct from capacity problems",
    skills: [
      "Distinguishing a shutdown-lifecycle bug from a scaling/capacity problem",
      "Reading per-pod termination behavior instead of aggregate replica health",
      "Weighing drain-timeout vs. deploy-strategy tradeoffs (deploy speed vs. request loss)",
      "Recognizing that scaling out does not fix a per-instance lifecycle defect",
    ],
    shortDescription:
      "Rolling deploys drop a steady trickle of requests — pods are killed before their shutdown hook finishes draining in-flight work.",
  },
};

export {
  gracefulShutdownDropsInFlightRequestsSimulation,
  gracefulShutdownDropsInFlightRequestsCandidateUI,
  GRACEFUL_SHUTDOWN_DROPS_IN_FLIGHT_REQUESTS_SCORING,
  INSPECT_SHUTDOWN_HOOK_LOGS_KEY,
  INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  DRAIN_TIMEOUT_SECONDS_KEY,
  DEPLOY_STRATEGY_KEY,
  REPLICA_COUNT_KEY,
};
