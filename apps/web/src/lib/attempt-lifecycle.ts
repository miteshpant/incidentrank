import type { Attempt } from "@incidentrank/db";

/**
 * Phase 6.1: attempt lifecycle (status) is deliberately separate from
 * incident outcome (outcome) — see packages/db/src/schema.ts's
 * attemptStatusEnum/attemptOutcomeEnum doc comments and
 * docs/architecture.md's Phase 6.1 section. `status` only ever answers
 * "is this attempt still active"; `outcome` only ever answers "how did it
 * end." `completed` does NOT mean "succeeded" — `completed` +
 * `declared_unstable` is a normal, expected combination (a candidate who
 * declared completion too early).
 *
 * Use these three predicates instead of comparing `attempt.status` or
 * `attempt.outcome` directly at call sites — centralizing the invariant
 * (`in_progress`→outcome null, `completed`→outcome required,
 * `abandoned`→outcome null) here means a future status/outcome value
 * never needs every call site updated individually.
 */

type LifecycleAttempt = Pick<Attempt, "status" | "outcome">;

export function isAttemptActive(attempt: LifecycleAttempt): boolean {
  return attempt.status === "in_progress";
}

export function isAttemptTerminal(attempt: LifecycleAttempt): boolean {
  return attempt.status === "completed" || attempt.status === "abandoned";
}

export function isIncidentResolved(attempt: LifecycleAttempt): boolean {
  return attempt.status === "completed" && attempt.outcome === "resolved";
}
