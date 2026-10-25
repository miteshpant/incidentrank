import type { ScenarioDefinition } from "./types";
import {
  distributedCoordinationFailureSimulation,
  FAILOVER_MODE_KEY,
  HEARTBEAT_INTERVAL_SECONDS_KEY,
  LEASE_DURATION_SECONDS_KEY,
  OWNERSHIP_FENCING_ENABLED_KEY,
  OWNERSHIP_RECONCILIATION_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./distributed-coordination-failure/definition";
import { distributedCoordinationFailureCandidateUI } from "./distributed-coordination-failure/candidate-ui";
import { DISTRIBUTED_COORDINATION_FAILURE_SCORING } from "./distributed-coordination-failure/scoring";

/**
 * Distributed Coordination Failure — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 59). A fleet of
 * workers pulls batches of work items through a Coordination Service
 * that tracks, across the WHOLE population of work items, which worker
 * currently owns which batch. The backing ownership table begins
 * serving stale reads. Unlike a single lock on a single shared
 * resource, this produces systemic, population-level effects: cohorts
 * of items end up with more than one believed owner (duplicate
 * ownership, and — without a write-time safeguard — duplicate
 * completions), other cohorts end up with no believed owner at all
 * (missed work, growing backlog), and workers sit idle waiting on
 * assignment signals the stale table never produces (stalled workers).
 * The candidate must recognize that neither chasing the symptom
 * (faster heartbeats, shorter leases) nor overcorrecting with
 * aggressive reassignment durably fixes a table that is itself the
 * root cause — and that reassigning work away from a worker that is
 * actually still alive is itself a correctness risk, not a safe
 * default.
 */
export const distributedCoordinationFailure: ScenarioDefinition = {
  id: "distributed-coordination-failure",
  slug: "distributed-coordination-failure",
  version: 1,
  name: "Distributed Coordination Failure",
  description:
    "A fleet of workers pulls batches of work items through a Coordination Service that tracks ownership across the entire item population. The backing ownership table has started serving stale reads. Every work item must eventually be processed exactly once — a batch processed twice can duplicate a real-world side effect, and a batch nobody believes it owns simply never gets processed, growing a backlog that the business is accountable for clearing. Diagnose whether ownership conflicts, missed work, or stalled workers (or some mix of all three) are the dominant failure right now, and bring the ownership table back to a state where every item has exactly one confirmed owner.",
  difficulty: "staff",
  estimatedMinutes: 18,
  isFree: false,
  simulation: distributedCoordinationFailureSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Coordination", "Scheduling", "Ownership", "Fencing", "Reconciliation", "Data Integrity"],
    skills: [
      "Diagnosing systemic ownership-table staleness across a worker/work-item population",
      "Distinguishing duplicate-ownership failures from missed-work failures",
      "Recognizing aggressive reassignment as a correctness risk, not a safe default",
      "Applying reconciliation (root-cause) versus fencing (write-time safeguard) as complementary fixes",
    ],
    shortDescription:
      "A coordination service's ownership table has gone stale, causing some work items to be claimed by two workers at once and others to be claimed by none.",
  },
};

export {
  distributedCoordinationFailureSimulation,
  distributedCoordinationFailureCandidateUI,
  DISTRIBUTED_COORDINATION_FAILURE_SCORING,
  FAILOVER_MODE_KEY,
  HEARTBEAT_INTERVAL_SECONDS_KEY,
  LEASE_DURATION_SECONDS_KEY,
  OWNERSHIP_FENCING_ENABLED_KEY,
  OWNERSHIP_RECONCILIATION_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
};
