import type { ScenarioDefinition } from "./types";
import {
  cascadingFailureAcrossSharedPlatformSimulation,
  ASYNC_WORKER_CONCURRENCY_KEY,
  ASYNC_WORKLOAD_DEFERRAL_KEY,
  CACHE_ASSIST_POLICY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  IDENTITY_CIRCUIT_BREAKER_KEY,
  IDENTITY_FAILURE_MODE_KEY,
  METADATA_WRITE_POLICY_KEY,
  PRODUCT_A_ISOLATION_KEY,
  PRODUCT_B_ISOLATION_KEY,
  PRODUCT_B_PRIORITY_KEY,
  PRODUCT_B_RETRY_POLICY_KEY,
  PRODUCT_C_ISOLATION_KEY,
  RESTORATION_ORDER_KEY,
} from "./cascading-failure-across-shared-platform/definition";
import { cascadingFailureAcrossSharedPlatformCandidateUI } from "./cascading-failure-across-shared-platform/candidate-ui";
import { CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING } from "./cascading-failure-across-shared-platform/scoring";

/**
 * Cascading Failure Across Shared Platform — a paid, Principal-level
 * IncidentRank scenario (docs/implementation_plan/phase6d.4.md, scenario
 * 80), the hardest scenario in the current catalog. Three independent
 * products — Product A, Product B, and Product C — all sit on the same
 * shared platform: a Shared Gateway, a Shared Cache, Shared Identity,
 * Shared Metadata, Shared Messaging with its Async Workers, and a
 * Shared Database. Shared Identity's token-validation latency degrades
 * first — that is the true root cause, and nothing else has moved yet
 * at that point. Product B's own aggressive retry policy then amplifies
 * that degradation into a genuine, compounding load multiplier against
 * the shared platform, making Product B's own dashboard the loudest,
 * reddest signal in the incident — but Product B did not cause the
 * degradation, and fully containing it alone leaves the platform
 * unsafe. Separately and more quietly, Product A's connections — held
 * open longer while waiting on slow identity validation — begin
 * exhausting the Shared Database's connection pool, a failure domain
 * that reveals itself only after the loud one is already dominating
 * attention. Five business invariants govern every decision here: (1) a
 * single product must not exhaust shared-platform capacity for every
 * product; (2) critical identity correctness must be preserved — an
 * unverifiable token must never be treated as valid merely to keep
 * availability metrics looking good; (3) shared metadata/database
 * durability must not be traded away for short-term availability; (4)
 * products may be intentionally degraded or isolated to protect the
 * platform — a safely isolated, not-yet-restored product is a
 * legitimate outcome, not a failure; and (5) recovering the root
 * dependency does not mean the Shared Messaging backlog and Shared
 * Database connection pressure it caused have already cleared — both
 * drain independently, on their own real-elapsed-time schedules, never
 * instantly. No single action resolves this incident: the candidate
 * must correctly diagnose which shared layer is the true root versus
 * which product is merely amplifying it, protect the root dependency
 * and contain the amplifier, cap shared capacity before scaling
 * anything that consumes it, observe both independent backlogs actually
 * drain, and only then restore products in a deliberate, safe order —
 * restoring before the platform has genuinely recovered retriggers the
 * entire cascade.
 */
export const cascadingFailureAcrossSharedPlatform: ScenarioDefinition = {
  id: "cascading-failure-across-shared-platform",
  slug: "cascading-failure-across-shared-platform",
  version: 1,
  name: "Cascading Failure Across Shared Platform",
  description:
    "Three independent products — Product A, Product B, and Product C — all run on the same shared platform: a Shared Gateway, a Shared Cache, Shared Identity, Shared Metadata, Shared Messaging with its Async Workers, and a Shared Database. Shared Identity's token-validation latency degrades first — the true root cause, before any product-level symptom appears. Product B's own aggressive retry policy then amplifies that degradation into a compounding load multiplier against the shared platform, making Product B's dashboard the loudest, reddest signal in the incident, even though Product B did not cause it and fully containing Product B alone does not make the platform safe. Separately and more quietly, Product A's connections — held open longer while waiting on slow identity validation — begin exhausting the Shared Database's connection pool. Five business invariants govern every decision: (1) a single product must not exhaust shared-platform capacity for every product; (2) critical identity correctness must be preserved — an unverifiable token must never be treated as valid merely to improve availability metrics; (3) shared metadata/database durability must not be traded away for short-term availability; (4) products may be intentionally degraded or isolated to protect the platform, and a safely isolated, not-yet-restored product is a legitimate outcome, not a failure; and (5) recovering the root dependency does not mean the backlog and connection pressure it caused have already cleared — both drain independently, on their own real-elapsed-time schedules, never instantly. Determine the true root failure domain, which product is amplifying the incident, which shared dependency to protect first, which product's traffic to isolate, the order in which to drain and recover, and the order in which to safely restore every product afterward — restoring before the platform has genuinely recovered retriggers the entire cascade.",
  difficulty: "principal",
  estimatedMinutes: 35,
  isFree: false,
  simulation: cascadingFailureAcrossSharedPlatformSimulation,
  library: {
    category: "Distributed Systems",
    tags: [
      "Shared Platform",
      "Multi-Product",
      "Root Cause Analysis",
      "Amplification",
      "Pressure Transfer",
      "Historical Damage",
      "Recovery Ordering",
      "Restoration Sequencing",
    ],
    skills: [
      "Distinguishing a true shared-dependency root cause from a loud amplifying product",
      "Diagnosing which of several products is amplifying an incident versus merely affected by it",
      "Protecting a shared dependency directly, independent of any single product's containment",
      "Sequencing containment, drain, and restoration across multiple independently-paced subsystems",
      "Recognizing that restoring too early retriggers a cascade that already looked resolved",
    ],
    shortDescription:
      "A shared-platform incident spanning three products and five shared dependency layers, where the loudest-complaining product is not the root cause and no single action resolves it.",
  },
};

export {
  cascadingFailureAcrossSharedPlatformSimulation,
  cascadingFailureAcrossSharedPlatformCandidateUI,
  CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
  ASYNC_WORKER_CONCURRENCY_KEY,
  ASYNC_WORKLOAD_DEFERRAL_KEY,
  CACHE_ASSIST_POLICY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  IDENTITY_CIRCUIT_BREAKER_KEY,
  IDENTITY_FAILURE_MODE_KEY,
  METADATA_WRITE_POLICY_KEY,
  PRODUCT_A_ISOLATION_KEY,
  PRODUCT_B_ISOLATION_KEY,
  PRODUCT_B_PRIORITY_KEY,
  PRODUCT_B_RETRY_POLICY_KEY,
  PRODUCT_C_ISOLATION_KEY,
  RESTORATION_ORDER_KEY,
};
