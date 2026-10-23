import type { ScenarioDefinition } from "./types";
import {
  deadlockStormSimulation,
  TRANSACTION_LOCK_ORDERING_KEY,
  DEADLOCK_RETRY_POLICY_KEY,
  RETRY_BACKOFF_KEY,
  TRANSACTION_SCOPE_KEY,
  SERVICE_CONCURRENCY_KEY,
  WRITE_SERIALIZATION_KEY,
} from "./deadlock-storm/definition";
import { deadlockStormCandidateUI } from "./deadlock-storm/candidate-ui";
import { DEADLOCK_STORM_SCORING } from "./deadlock-storm/scoring";

/**
 * Deadlock Storm — a paid IncidentRank scenario (Phase 6B, Databases &
 * Storage). Checkout routes through Order Service, and both Order Service
 * and Inventory Service write to the same PostgreSQL database. A recent
 * deployment changed the order in which the two services acquire row
 * locks on the shared orders/inventory tables, so concurrent checkouts
 * now deadlock in the database. Per-account order correctness and
 * inventory accuracy both depend on these writes landing cleanly — the
 * database must stay the single source of truth for both order and stock
 * state, so write availability for both services matters equally.
 *
 * The scenario's central trap: increasing deadlock retries (or adding
 * concurrent workers) without addressing lock order does not fix
 * anything — it increases the rate at which transactions race for the
 * same conflicting locks, so deadlocks per second and lock wait time
 * climb even as checkout failure rate can look deceptively tolerable.
 * The durable fix is removing the circular-wait condition itself (a
 * consistent lock acquisition order across both services), with a
 * genuinely safe but slower emergency alternative (temporarily
 * serializing writes to the contended tables) available while that fix
 * rolls out.
 */
export const deadlockStorm: ScenarioDefinition = {
  id: "deadlock-storm",
  slug: "deadlock-storm",
  version: 1,
  name: "Deadlock Storm",
  description:
    "Checkout routes through Order Service, and both Order Service and Inventory Service write to the same PostgreSQL database. Since a recent deployment, concurrent checkouts have started deadlocking in the database — transaction retries, lock wait time, and checkout failures are all climbing. Order correctness and inventory accuracy both depend on these writes landing cleanly, so neither service's write path can simply be taken offline. Diagnose why the two services are colliding on the same locked rows and restore reliable checkout throughput without just burying the conflict under more retries.",
  difficulty: "senior",
  estimatedMinutes: 16,
  isFree: false,
  simulation: deadlockStormSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["PostgreSQL", "Deadlocks", "Transactions", "Locking", "Concurrency"],
    skills: [
      "Diagnosing lock-order deadlocks across services sharing a database",
      "Distinguishing masking a deadlock from removing its root cause",
      "Recognizing when more retries or concurrency amplify contention",
      "Evaluating a safe-but-slow emergency mitigation against a durable fix",
    ],
    shortDescription:
      "Two services acquiring database locks in inconsistent order are deadlocking each other on every concurrent checkout.",
  },
};

export {
  deadlockStormSimulation,
  deadlockStormCandidateUI,
  DEADLOCK_STORM_SCORING,
  TRANSACTION_LOCK_ORDERING_KEY,
  DEADLOCK_RETRY_POLICY_KEY,
  RETRY_BACKOFF_KEY,
  TRANSACTION_SCOPE_KEY,
  SERVICE_CONCURRENCY_KEY,
  WRITE_SERIALIZATION_KEY,
};
