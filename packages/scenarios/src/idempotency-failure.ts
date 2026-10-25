import type { ScenarioDefinition } from "./types";
import {
  idempotencyFailureSimulation,
  KEY_SCOPE_KEY,
  KEY_TTL_SECONDS_KEY,
  RETRY_STRATEGY_KEY,
  STORAGE_MODE_KEY,
  STORE_UNAVAILABLE_BEHAVIOR_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./idempotency-failure/definition";
import { idempotencyFailureCandidateUI } from "./idempotency-failure/candidate-ui";
import { IDEMPOTENCY_FAILURE_SCORING } from "./idempotency-failure/scoring";

/**
 * Idempotency Failure — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 58). The idempotency
 * store sitting between the queue worker and the external side effect
 * begins degrading, and — on single-node storage — that degradation
 * escalates to the store becoming effectively unreachable. This is
 * genuinely distinct from a client/gateway retry-ambiguity problem or a
 * message-broker redelivery problem: here, even a request that arrives
 * and is retried exactly the way it should be can still have its side
 * effect run more than once, because the mechanism meant to recognize
 * "I already did this" is itself the thing that is broken — through key
 * eviction happening before a legitimate retry can arrive, a key scope
 * that collapses or fails to recognize the right requests, or the store
 * going unreachable entirely. The candidate must recognize that
 * request-success-rate and throughput metrics can look perfectly healthy
 * while real duplicate side effects accumulate underneath them, and that
 * failing closed under a store outage is a deliberate, costly, but
 * genuinely safe tradeoff — not a free action.
 */
export const idempotencyFailure: ScenarioDefinition = {
  id: "idempotency-failure",
  slug: "idempotency-failure",
  version: 1,
  name: "Idempotency Failure",
  description:
    "A background worker checks an idempotency store before calling an external side-effect API (e.g. a fulfillment or payment call) on behalf of queued requests. That store is degrading. Each external side effect must run at most once per logical request — a side effect applying more than once is a critical correctness incident regardless of how healthy request success rate and throughput otherwise look, and dropping a legitimate request's side effect entirely is an equally real integrity failure, not a cosmetic one. Diagnose why the store is failing to prevent duplication and bring the system to a state that is genuinely safe to hand back.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  simulation: idempotencyFailureSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Idempotency", "Deduplication", "Correctness", "Fail-Open vs Fail-Closed", "Key Scoping"],
    skills: [
      "Distinguishing availability metrics from correctness guarantees",
      "Reasoning about idempotency-key TTL versus realistic retry horizons",
      "Evaluating key-scope tradeoffs between false duplicates and missed duplicates",
      "Weighing fail-open against fail-closed behavior under a dependency outage",
    ],
    shortDescription:
      "The idempotency store itself is degrading, and duplicate (or silently dropped) side effects keep accumulating even while throughput looks healthy.",
  },
};

export {
  idempotencyFailureSimulation,
  idempotencyFailureCandidateUI,
  IDEMPOTENCY_FAILURE_SCORING,
  KEY_SCOPE_KEY,
  KEY_TTL_SECONDS_KEY,
  RETRY_STRATEGY_KEY,
  STORAGE_MODE_KEY,
  STORE_UNAVAILABLE_BEHAVIOR_KEY,
  WORKER_CONCURRENCY_KEY,
};
