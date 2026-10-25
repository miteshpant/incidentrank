import type {
  CompletionMode,
  ScenarioSimulationDefinition,
  ScoringInputs,
  SimulationState,
} from "./types";
import { extractScoringInputs } from "./scoring";

/**
 * Whether engine state has reached a terminal condition WITHOUT a Finish
 * declaration — i.e. a terminal condition the engine itself is allowed to
 * write automatically. Per the Phase 7.1 doctrine ("the system may fail a
 * candidate automatically, but it must never pass a candidate
 * automatically"), tick.ts never auto-writes status="resolved" for ANY
 * completion mode — only "failed" can ever be written automatically.
 * Reaching "resolved" terminality therefore happens exclusively via a
 * successful Finish declaration, never via this predicate, regardless of
 * mode. The `completionMode` parameter and the per-mode branch are kept
 * (rather than collapsing this to a single unconditional check) only
 * because the "automatic" branch's `state.status === "resolved"` clause
 * is now permanently unreachable, not because it changes behavior — it
 * stays as explicit, self-documenting proof that automatic-mode scenarios
 * never actually reach that state outside a Finish call. Shared by every
 * runtime that needs to decide "should I stop ticking / show a terminal
 * view without Finish having been called" — the practice client hook,
 * and the assessment server runtime alike.
 */
export function isLocallyTerminal(state: SimulationState, completionMode: CompletionMode): boolean {
  if (completionMode === "automatic") {
    return state.status === "resolved" || state.status === "failed";
  }
  return state.status === "failed";
}

export type CompletionTier = "optimal" | "acceptable";

export type CompletionEligibility =
  | { eligible: true; tier: CompletionTier }
  | { eligible: false };

/**
 * The single place Finish-eligibility is decided, for both the
 * persisted-attempt endpoint (POST /api/attempts/:attemptId/finish), the
 * anonymous stateless preview (POST /api/attempts/finish-preview), and
 * any test harness scoring a candidate_declared scenario — never
 * duplicated per call site. Reads the exact same sustain-tracking state
 * tick.ts already maintains unconditionally
 * (state.transitions.consecutiveSuccessSeconds /
 * consecutiveAcceptableSeconds), rather than re-evaluating success/
 * acceptable conditions a second time — see docs/implementation_plan/
 * phase6.1.md's "Finish should query the same success-state semantics
 * already maintained by simulation, not implement a second version of
 * the condition evaluator."
 *
 * successCondition (optimal) takes priority over acceptableCondition
 * (acceptable) when both happen to be currently satisfied. Both sustain
 * windows are evaluated purely from state already present — if the
 * system was sustained-stable earlier but has since regressed, the
 * relevant consecutive*Seconds counter was already reset to 0 by the
 * engine's own tick logic (no special-casing needed here): Finish asks
 * whether the system is stable *now*, never whether it was stable at
 * some earlier point.
 *
 * Callers in apps/web must never serialize this result (or the
 * underlying consecutive*Seconds fields) to an assessment client — that
 * would leak the hidden success oracle the candidate-declared completion
 * model exists to protect against.
 */
export function evaluateCompletionEligibility(
  scenario: ScenarioSimulationDefinition,
  state: SimulationState,
): CompletionEligibility {
  const successSustained =
    state.transitions.consecutiveSuccessSeconds >= scenario.successCondition.sustainedSeconds;
  if (successSustained) {
    return { eligible: true, tier: "optimal" };
  }

  const acceptableCondition = scenario.completion?.acceptableCondition;
  if (acceptableCondition) {
    const acceptableSustained =
      state.transitions.consecutiveAcceptableSeconds >= acceptableCondition.sustainedSeconds;
    if (acceptableSustained) {
      return { eligible: true, tier: "acceptable" };
    }
  }

  return { eligible: false };
}

/**
 * The generic scorer (packages/scenarios/src/authoring/score.ts) derives
 * recovery/reliability entirely from ScoringInputs.resolvedAtMs, which the
 * engine never writes for a candidate_declared outcome — Finish is a
 * candidate declaration, not a state mutation. This derives a
 * scoring-only stand-in: the moment the ACCEPTED tier's condition became
 * continuously true, read from the engine's own existing sustain
 * counters — never the wall-clock moment the candidate happened to click
 * Finish, and never re-evaluating the success/acceptable condition a
 * second time.
 *
 * tier="optimal" uses consecutiveSuccessSeconds; tier="acceptable" uses
 * consecutiveAcceptableSeconds — the two tiers' sustain windows are
 * tracked independently (tick.ts), so an acceptable-tier Finish must use
 * acceptable's own stabilization instant, never optimal's. Only call this
 * when evaluateCompletionEligibility returned eligible:true —
 * declared_unstable outcomes never get a synthetic resolvedAtMs.
 */
export function deriveScoringResolvedAtMs(
  state: SimulationState,
  tier: CompletionTier,
): number {
  const sustainedSeconds =
    tier === "optimal"
      ? state.transitions.consecutiveSuccessSeconds
      : state.transitions.consecutiveAcceptableSeconds;
  return state.simulationTimeMs - sustainedSeconds * 1_000;
}

export interface CandidateDeclaredFinishResult {
  outcome: "resolved" | "declared_unstable";
  completionTier: CompletionTier | null;
  state: SimulationState;
  /**
   * Scoring-only derived timestamp (see deriveScoringResolvedAtMs) — the
   * moment the accepted tier's condition actually became sustained-true,
   * not the wall-clock moment the candidate clicked Finish. Null for
   * declared_unstable. Never persisted as engine state; pass to
   * extractScoringInputs's resolvedAtMsOverride only.
   */
  scoringResolvedAtMs: number | null;
}

/**
 * The single completion-decision core both the practice Finish path
 * (apps/web/src/lib/server/finish-attempt.ts) and the assessment Finish
 * path share — per docs/implementation_plan/phase6.1.md's binding "same
 * simulator, same completion evaluator, same scorer; only persistence/
 * auth differs" decision. Pure function of (scenario, already-replayed
 * state) → decision; callers own persistence/auth/idempotency entirely.
 *
 * A true automatic failure condition always wins, even for a
 * candidate_declared scenario — failure remains fully automatic. tick.ts
 * already evaluates this unconditionally every tick, so
 * state.status === "failed" here means the failure condition was
 * genuinely, authoritatively met — Finish cannot override that.
 */
export function evaluateCandidateDeclaredFinish(
  scenario: ScenarioSimulationDefinition,
  state: SimulationState,
): CandidateDeclaredFinishResult {
  if (state.status === "failed") {
    return { outcome: "declared_unstable", completionTier: null, state, scoringResolvedAtMs: null };
  }

  const eligibility = evaluateCompletionEligibility(scenario, state);
  if (!eligibility.eligible) {
    return { outcome: "declared_unstable", completionTier: null, state, scoringResolvedAtMs: null };
  }

  return {
    outcome: "resolved",
    completionTier: eligibility.tier,
    state,
    scoringResolvedAtMs: deriveScoringResolvedAtMs(state, eligibility.tier),
  };
}

/**
 * Builds the ScoringInputs for a CandidateDeclaredFinishResult — the
 * resolvedAtMsOverride wiring every caller of evaluateCandidateDeclaredFinish
 * needs, kept in one place so practice and assessment can't drift.
 */
export function extractFinishScoringInputs(
  scenario: { infrastructureCost: { baselineMonthlyUsd: number } },
  result: CandidateDeclaredFinishResult,
): ScoringInputs {
  return extractScoringInputs(scenario, result.state, {
    resolvedAtMsOverride: result.scoringResolvedAtMs ?? undefined,
  });
}
