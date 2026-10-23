import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DEADLOCK_RETRY_POLICY_KEY,
  SERVICE_CONCURRENCY_KEY,
  TRANSACTION_LOCK_ORDERING_KEY,
  TRANSACTION_SCOPE_KEY,
  WRITE_SERIALIZATION_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping. Never used to decide resolution/failure — see
 * rules.ts/revenue-and-cost.ts for the actual state machine. `feedback`
 * is a post-incident educational explanation only, revealed after a
 * terminal practice attempt — never read during active play. Each `id`
 * is a stable, neutral token, never self-descriptive of the authored
 * logic it matches.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: TRANSACTION_LOCK_ORDERING_KEY,
    valueEquals: "canonical",
    whenTriggerEquals: { lockOrderConflict: true },
    outcome: "beneficial",
    feedback: {
      title: "Removed the circular-wait condition",
      explanation:
        "Order Service and Inventory Service were acquiring locks on the shared orders/inventory tables in opposite order, so two concurrent checkouts could each hold one resource while waiting on the other — a classic deadlock. Making both services acquire locks in the same order removes the circular wait at its source, so deadlocks stop occurring regardless of how much concurrent traffic arrives.",
    },
  },
  {
    id: "acr_2",
    controlKey: WRITE_SERIALIZATION_KEY,
    valueEquals: true,
    whenTriggerEquals: { lockOrderConflict: true },
    outcome: "beneficial",
    feedback: {
      title: "Traded throughput for correctness",
      explanation:
        "Serializing writes to the contended tables removes any possibility of two transactions holding conflicting locks at the same time, which eliminates deadlocks immediately without touching application code. The tradeoff is real: checkout latency and throughput both degrade noticeably while writes are serialized, so this is a legitimate short-term stabilization, not a permanent architecture.",
    },
  },
  {
    id: "acr_3",
    controlKey: DEADLOCK_RETRY_POLICY_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { lockOrderConflict: true },
    outcome: "harmful",
    feedback: {
      title: "Retry amplification increased lock contention",
      explanation:
        "Aggressive, immediate retries against transactions that lost a deadlock meant more concurrent attempts to re-acquire the same conflicting locks, not fewer. Because the underlying lock-order conflict was never addressed, every added retry attempt increased deadlock frequency and lock wait time instead of helping transactions get through.",
    },
  },
  {
    id: "acr_4",
    controlKey: SERVICE_CONCURRENCY_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { lockOrderConflict: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled concurrency into an unresolved conflict",
      explanation:
        "Adding more concurrent workers increases the rate at which Order Service and Inventory Service race for the same contended locks. With the lock-order conflict still present, this made deadlocks and lock wait time measurably worse rather than improving throughput — the bottleneck was lock ordering, not worker count.",
    },
  },
  {
    id: "acr_5",
    controlKey: DEADLOCK_RETRY_POLICY_KEY,
    valueEquals: "bounded",
    whenTriggerEquals: { lockOrderConflict: true },
    outcome: "neutral",
    feedback: {
      title: "Bounded the blast radius without fixing the cause",
      explanation:
        "Capping retry attempts prevents the worst-case retry amplification of an unbounded policy, which is a reasonable damage-control step. It does not address the lock-order conflict itself, so deadlocks keep occurring and checkout failures become visible once the bound is exhausted — a partial mitigation, not a resolution.",
    },
  },
  {
    id: "acr_6",
    controlKey: TRANSACTION_SCOPE_KEY,
    valueEquals: "narrow",
    whenTriggerEquals: { lockOrderConflict: true },
    outcome: "neutral",
    feedback: {
      title: "Shortened the lock hold window",
      explanation:
        "Narrowing transaction scope reduces how long each transaction holds its locks, shrinking the window in which two services can collide — a genuine, if partial, reduction in deadlock frequency. It does not remove the conflicting lock order itself, so the underlying risk remains.",
    },
  },
];
