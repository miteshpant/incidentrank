import "server-only";

/**
 * Finish-eligibility and its scoring-timestamp derivation now live in
 * packages/simulator/src/completion.ts (promoted there so
 * packages/scoring's test harness can share the exact same logic
 * real Finish requests use, rather than re-implementing it — see
 * docs/implementation_plan/phase6.1.md's "single source of truth"
 * mandate). This module re-exports them with the "server-only" guard
 * intact: callers in apps/web must never serialize eligibility results
 * (or the underlying consecutive*Seconds fields) to an assessment
 * client — that would leak the hidden success oracle the
 * candidate-declared completion model exists to protect against.
 */
export {
  evaluateCompletionEligibility,
  deriveScoringResolvedAtMs,
  type CompletionTier,
  type CompletionEligibility,
} from "@incidentrank/simulator";
