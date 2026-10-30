import "server-only";

/**
 * Phase 10E benchmark versioning (docs/implementation_plan/phase10e.md
 * §26). Every benchmark_attempt_facts row pins the version of each
 * methodology that produced it — a future change to scoring, Engineer
 * Rank, or the benchmark projection itself must never silently
 * reinterpret old evidence. Bump the relevant constant when its
 * methodology changes; existing fact rows keep their original value,
 * and a rematerialization under a new BENCHMARK_PROJECTION_VERSION
 * creates a parallel new-version row set rather than overwriting history
 * (see materialize.ts's upsert target).
 */

// First time a scoring-version concept exists anywhere in this codebase
// (phase10e.md §26: "Add a scoring version constant if none exists").
// Bump only on a genuine methodology change to scoreAttempt's formula —
// never for an unrelated code refactor.
export const SCORING_VERSION = "v1";

export const BENCHMARK_PROJECTION_VERSION = "v1";

// Reused as-is from engineer-rank.ts — the single source of truth for
// which rank algorithm produced a given rank_before/rank_after value.
export { ENGINEER_RANK_ALGORITHM_VERSION as RANK_ALGORITHM_VERSION } from "../engineer-rank";
