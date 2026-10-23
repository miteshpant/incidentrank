import type { ScenarioDefinition } from "./types";
import {
  distributedLockFailureSimulation,
  ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
  FENCING_TOKEN_ENABLED_KEY,
  LEASE_DURATION_SECONDS_KEY,
  LEASE_RENEWAL_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./distributed-lock-failure/definition";
import { distributedLockFailureCandidateUI } from "./distributed-lock-failure/candidate-ui";
import { DISTRIBUTED_LOCK_FAILURE_SCORING } from "./distributed-lock-failure/scoring";

/**
 * Distributed Lock Failure — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 24). A fleet of
 * workers coordinates access to a shared resource through a
 * distributed lock service. A downstream dependency slowdown makes
 * individual job processing routinely outlive the configured lock
 * lease: leases expire while a worker is still legitimately mid-job,
 * letting a second worker acquire the "same" lock and begin concurrent,
 * conflicting work against the shared resource. The shared resource
 * must never accept two conflicting writes for the same logical unit of
 * work — duplicate or lost writes against it are a critical data-
 * integrity incident, not merely a performance regression. The
 * candidate must recognize that simply lengthening the lease only
 * reduces how often this happens, at the cost of a much slower recovery
 * window if a worker genuinely crashes while holding it.
 */
export const distributedLockFailure: ScenarioDefinition = {
  id: "distributed-lock-failure",
  slug: "distributed-lock-failure",
  version: 1,
  name: "Distributed Lock Failure",
  description:
    "A fleet of workers coordinates exclusive access to a shared resource through a distributed lock service. A downstream dependency has slowed down, and individual jobs are now routinely taking longer than the configured lock lease. The shared resource must never apply two conflicting writes for the same unit of work — a duplicate or lost write here is a critical correctness incident, not a performance blip, and simply making the symptom less frequent is not the same as making the system safe. Diagnose why the same work is being processed more than once, and bring the system back to a state you can confidently hand back.",
  difficulty: "staff",
  estimatedMinutes: 15,
  isFree: false,
  simulation: distributedLockFailureSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Distributed Locking", "Fencing Tokens", "Leases", "Concurrency", "Data Integrity"],
    skills: [
      "Diagnosing lease-expiry-during-processing failures",
      "Recognizing that longer leases trade correctness-risk frequency for slower crash recovery",
      "Applying fencing tokens / ownership validation as a durable correctness fix",
      "Distinguishing a currently-healthy-looking state from a genuinely safe one",
    ],
    shortDescription:
      "Lock leases are expiring while workers are still processing, letting two workers believe they own the same lock at once — and the obvious fix of lengthening the lease only hides the problem.",
  },
};

export {
  distributedLockFailureSimulation,
  distributedLockFailureCandidateUI,
  DISTRIBUTED_LOCK_FAILURE_SCORING,
  ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
  FENCING_TOKEN_ENABLED_KEY,
  LEASE_DURATION_SECONDS_KEY,
  LEASE_RENEWAL_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
};
