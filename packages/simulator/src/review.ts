import { classifyAction } from "./actions";
import { createInitialState, simulate } from "./simulate";
import type {
  ActionFeedback,
  ActionOutcome,
  ControlValue,
  ScenarioSimulationDefinition,
  SimulationState,
} from "./types";
import type { ReplayActionGroup } from "./replay";

export interface ReviewActionChange {
  controlKey: string;
  previousValue: ControlValue;
  newValue: ControlValue;
  outcome: ActionOutcome;
  /** Authored post-incident explanation for this specific change, if the
   * matched classification rule has one. Null when no rule matched
   * (outcome defaulted to "neutral") or the matched rule has no
   * `feedback`. Resolved by re-running classifyAction against the exact
   * triggers/state present at the moment this change was originally
   * applied — never inferred from final state, since
   * whenTriggerEquals-gated rules can match differently at different
   * points in time (see ActionFeedback's doc comment). */
  feedback: ActionFeedback | null;
}

export interface ReviewActionGroup {
  elapsedMs: number;
  changes: ReviewActionChange[];
}

export interface ReviewAttemptResult {
  state: SimulationState;
  actionGroups: ReviewActionGroup[];
}

/**
 * Phase 6.1 post-incident review: deterministically replays an attempt's
 * persisted action groups (same mechanism as replayAttempt) while ALSO
 * resolving each individual change's matched classification rule and its
 * authored feedback, at the exact moment that change was originally
 * applied. This is a server-only, post-completion concern — callers must
 * gate it to practice attempts, terminal attempts, and never serialize
 * ReviewActionChange.feedback to any live/active client. classifyAction
 * itself never returns feedback text (see its own doc comment) — only
 * this function, re-running classification server-side during review,
 * ever attaches feedback, specifically so a live/active client (which
 * runs simulate() directly, e.g. apps/web/src/lib/
 * use-incident-attempt.ts) can never have feedback text in its bundle or
 * runtime state. `elapsedMs` is the target simulation time to
 * reconstruct state at — mirrors replayAttempt's own parameter exactly
 * (final trailing gap included), so the two functions agree on final
 * state for the same input.
 */
export function reviewAttempt(
  scenario: ScenarioSimulationDefinition,
  actionGroups: ReplayActionGroup[],
  elapsedMs: number,
): ReviewAttemptResult {
  let state = createInitialState(scenario);
  const reviewGroups: ReviewActionGroup[] = [];

  const ordered = [...actionGroups].sort((a, b) => a.elapsedMs - b.elapsedMs);

  for (const group of ordered) {
    const targetMs = Math.min(group.elapsedMs, elapsedMs);
    const gapMs = targetMs - state.simulationTimeMs;
    if (gapMs > 0) {
      state = simulate(scenario, state, null, gapMs).state;
    }

    if (group.elapsedMs > elapsedMs) break;

    const reviewChanges: ReviewActionChange[] = [];
    for (const change of group.changes) {
      const previousValue = state.controlValues[change.controlKey]!;

      const classification = classifyAction(
        scenario.actionClassifications,
        change.controlKey,
        change.value,
        state.triggers,
      );
      const matchedRule =
        classification.matchedRuleId !== null
          ? scenario.actionClassifications.find(
              (rule, index) => (rule.id ?? String(index)) === classification.matchedRuleId,
            )
          : undefined;

      reviewChanges.push({
        controlKey: change.controlKey,
        previousValue,
        newValue: change.value,
        outcome: classification.outcome,
        feedback: matchedRule?.feedback ?? null,
      });

      state = simulate(
        scenario,
        state,
        {
          id: `review-action-${group.elapsedMs}-${change.controlKey}`,
          timestampMs: state.simulationTimeMs,
          controlKey: change.controlKey,
          value: change.value,
        },
        0,
      ).state;
    }

    reviewGroups.push({ elapsedMs: group.elapsedMs, changes: reviewChanges });
  }

  const finalGapMs = elapsedMs - state.simulationTimeMs;
  if (finalGapMs > 0) {
    state = simulate(scenario, state, null, finalGapMs).state;
  }

  return { state, actionGroups: reviewGroups };
}
