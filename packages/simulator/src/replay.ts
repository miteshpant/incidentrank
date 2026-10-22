import { createInitialState, simulate } from "./simulate";
import type {
  CandidateAction,
  ControlValue,
  ScenarioSimulationDefinition,
  SimulationEvent,
  SimulationState,
} from "./types";

/**
 * One candidate decision as persisted (attempt_action_groups +
 * attempt_action_changes): everything changed in a single Apply click, in
 * their originally recorded per-control order. Reasoning is intentionally
 * not part of this shape — see docs/architecture.md "Candidate Reasoning
 * Is Recorded, Not Evaluated": reasoning never reaches replay, matching
 * every other Phase 0+ guarantee that reasoning cannot affect simulation
 * or scoring.
 */
export interface ReplayActionGroup {
  elapsedMs: number;
  changes: Array<{ controlKey: string; value: ControlValue }>;
}

export interface ReplayAttemptInput {
  scenario: ScenarioSimulationDefinition;
  /** Target simulation time to reconstruct state at. */
  elapsedMs: number;
  /** Persisted candidate decisions, in original recorded order. */
  actionGroups: ReplayActionGroup[];
}

export interface ReplayResult {
  state: SimulationState;
  /** All events regenerated during replay, in chronological order. */
  events: SimulationEvent[];
}

/**
 * Deterministically reconstructs engine state at `elapsedMs` by replaying
 * persisted candidate decisions against a fresh initial state — the same
 * mechanism `simulate()` already uses for one live tick/action, applied
 * repeatedly. Candidate actions are the only replay input; persisted
 * system events are never replayed as commands (per
 * docs/architecture.md) — they are audit history, regenerated here as a
 * side effect of re-running the deterministic scenario, not read back in.
 *
 * No Next.js, Clerk, or database dependency — pure function over
 * scenario + input data, usable from any context (server route, test,
 * future practice-mode resume).
 */
export function replayAttempt({
  scenario,
  elapsedMs,
  actionGroups,
}: ReplayAttemptInput): ReplayResult {
  let state = createInitialState(scenario);
  const events: SimulationEvent[] = [];

  const ordered = [...actionGroups].sort((a, b) => a.elapsedMs - b.elapsedMs);

  let actionSeq = 0;
  for (const group of ordered) {
    const targetMs = Math.min(group.elapsedMs, elapsedMs);
    const gapMs = targetMs - state.simulationTimeMs;
    if (gapMs > 0) {
      const advanced = simulate(scenario, state, null, gapMs);
      state = advanced.state;
      events.push(...advanced.events);
    }

    if (group.elapsedMs > elapsedMs) {
      // This decision (and any later ones) happened after the target
      // elapsed time — stop here, matching exactly what the candidate had
      // observed at that moment.
      break;
    }

    for (const change of group.changes) {
      actionSeq += 1;
      const action: CandidateAction = {
        id: `replay-action-${actionSeq}`,
        timestampMs: state.simulationTimeMs,
        controlKey: change.controlKey,
        value: change.value,
      };
      const applied = simulate(scenario, state, action, 0);
      state = applied.state;
      events.push(...applied.events);
    }
  }

  const finalGapMs = elapsedMs - state.simulationTimeMs;
  if (finalGapMs > 0) {
    const advanced = simulate(scenario, state, null, finalGapMs);
    state = advanced.state;
    events.push(...advanced.events);
  }

  return { state, events };
}
