"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  createInitialState,
  extractScoringInputs,
  isLocallyTerminal,
  simulate,
  type CandidateAction,
  type ControlValue,
  type ScenarioSimulationDefinition,
  type SimulationEvent,
  type SimulationState,
} from "@incidentrank/simulator";
import {
  completeAttemptRecord,
  createAttemptRecord,
  persistActionGroup,
  persistCheckpoint,
  persistEvents,
  requestFinish,
  requestFinishPreview,
  requestScorePreview,
  type ServerScoreResult,
} from "./attempt-persistence";

/**
 * Phase 6.1: the candidate-declared completion outcome, once known. Null
 * until a terminal state is reached. For automatic scenarios this mirrors
 * state.status 1:1 (resolved/failed); for candidate_declared scenarios
 * this is set ONLY from the server's Finish response (or an automatic
 * failure, which still fires client-side identically to today) — never
 * derived from the client's local SimulationState.status, since the
 * engine itself never auto-writes "resolved" for candidate_declared
 * scenarios. See apps/web/src/lib/server/finish-attempt.ts.
 */
export type IncidentOutcome = "resolved" | "failed" | "declared_unstable";
export type CompletionTier = "optimal" | "acceptable";

/** How often the elapsed-time checkpoint is persisted while active. */
const CHECKPOINT_INTERVAL_MS = 12_000;

export interface TimelineEntry extends SimulationEvent {
  source: "system" | "you";
}

/**
 * One candidate decision: everything changed in a single Apply click, plus
 * the candidate's optional explanation. This is an attempt/UI-level
 * representation only — the engine's flat CONFIG_CHANGED event stream is
 * unchanged and remains the authoritative record of what actually happened.
 */
export interface CandidateActionGroupChange {
  controlKey: string;
  previousValue: ControlValue;
  newValue: ControlValue;
}

export interface CandidateActionGroup {
  id: string;
  elapsedMs: number;
  reasoning: string | null;
  changes: CandidateActionGroupChange[];
}

export type AttemptPhase = "briefing" | "active" | "result" | "paused";

/**
 * Reconstructed state to seed the hook with instead of a fresh briefing
 * (Phase 4.1 resume). Produced server-side by replaying persisted action
 * groups via packages/simulator's replayAttempt — this hook never
 * replays anything itself, it only adopts the already-reconstructed
 * result and continues persistence sequence numbers from where they left
 * off, so resume can never duplicate historical action groups or events.
 */
export interface ResumeSeed {
  attemptId: string;
  engineState: SimulationState;
  timeline: TimelineEntry[];
  actionGroups: CandidateActionGroup[];
  nextGroupSeq: number;
  nextEventSeq: number;
}

interface AttemptState {
  phase: AttemptPhase;
  engineState: SimulationState;
  timeline: TimelineEntry[];
  actionGroups: CandidateActionGroup[];
  pendingControlValues: Record<string, ControlValue>;
  nextActionSeq: number;
  nextGroupSeq: number;
  /** Server-assigned attempt id once persistence has created the record. */
  attemptId: string | null;
  /** Events not yet handed to persistEvents(), with their global sequence. */
  unsyncedEvents: Array<{ sequence: number; entry: TimelineEntry }>;
  nextEventSeq: number;
  /** Set once a terminal outcome is known — see IncidentOutcome's doc
   * comment for why this is never derived from engineState.status alone
   * for candidate_declared scenarios. */
  outcome: IncidentOutcome | null;
  completionTier: CompletionTier | null;
  /** True while an in-flight Finish request is awaiting the server's
   * answer — disables the Finish button and suppresses a double-submit. */
  finishing: boolean;
  finishError: string | null;
}

type AttemptReducerAction =
  | { type: "acknowledge" }
  | { type: "attempt-created"; attemptId: string }
  | { type: "set-pending-value"; controlKey: string; value: ControlValue }
  | { type: "apply-changes"; reasoning: string }
  | { type: "tick" }
  | { type: "events-synced"; throughSequence: number }
  | { type: "resume-from-seed"; seed: ResumeSeed }
  | { type: "resume-clock" }
  | { type: "finish-requested" }
  | {
      type: "finish-resolved";
      outcome: IncidentOutcome;
      completionTier: CompletionTier | null;
    }
  | { type: "finish-failed"; error: string }
  | { type: "reset" };

/** Has the scenario's first timed event (incident start) fired yet? */
export function hasIncidentStarted(state: SimulationState): boolean {
  return state.transitions.nextTimedEventIndex > 0;
}

/** When the scenario's incident begins, derived from scenario data only. */
export function incidentStartMs(
  scenario: ScenarioSimulationDefinition,
): number | null {
  return scenario.timedEvents[0]?.atMs ?? null;
}

const CANDIDATE_EVENT_TYPES = new Set(["CONFIG_CHANGED", "CONFIG_CHANGE_REJECTED"]);

function toTimelineEntries(events: SimulationEvent[]): TimelineEntry[] {
  return events.map((event) => ({
    ...event,
    source: CANDIDATE_EVENT_TYPES.has(event.type) ? "you" : "system",
  }));
}

function createAttemptState(scenario: ScenarioSimulationDefinition): AttemptState {
  const engineState = createInitialState(scenario);
  return {
    phase: "briefing",
    engineState,
    timeline: [],
    actionGroups: [],
    pendingControlValues: { ...engineState.controlValues },
    nextActionSeq: 0,
    nextGroupSeq: 0,
    attemptId: null,
    unsyncedEvents: [],
    nextEventSeq: 0,
    outcome: null,
    completionTier: null,
    finishing: false,
    finishError: null,
  };
}

function queueUnsyncedEvents(
  state: AttemptState,
  events: TimelineEntry[],
): Pick<AttemptState, "unsyncedEvents" | "nextEventSeq"> {
  let nextEventSeq = state.nextEventSeq;
  const queued = events.map((entry) => ({
    sequence: nextEventSeq++,
    entry,
  }));
  return {
    unsyncedEvents: [...state.unsyncedEvents, ...queued],
    nextEventSeq,
  };
}

function createReducer(scenario: ScenarioSimulationDefinition) {
  const completionMode = scenario.completion?.mode ?? "automatic";

  return function reduce(
    state: AttemptState,
    action: AttemptReducerAction,
  ): AttemptState {
    switch (action.type) {
      case "acknowledge": {
        if (state.phase !== "briefing") return state;
        return { ...state, phase: "active" };
      }

      case "attempt-created": {
        if (state.attemptId) return state;
        return { ...state, attemptId: action.attemptId };
      }

      case "set-pending-value": {
        return {
          ...state,
          pendingControlValues: {
            ...state.pendingControlValues,
            [action.controlKey]: action.value,
          },
        };
      }

      case "apply-changes": {
        if (
          state.phase !== "active" ||
          isLocallyTerminal(state.engineState, completionMode) ||
          !hasIncidentStarted(state.engineState)
        ) {
          return state;
        }

        let workingState = state.engineState;
        let nextActionSeq = state.nextActionSeq;
        const appliedEvents: SimulationEvent[] = [];
        const groupChanges: CandidateActionGroupChange[] = [];

        for (const control of scenario.controls) {
          const key = control.key;
          const nextValue = state.pendingControlValues[key];
          const previousValue = workingState.controlValues[key];
          if (nextValue === undefined || nextValue === previousValue) continue;

          nextActionSeq += 1;
          const candidateAction: CandidateAction = {
            id: `candidate-action-${nextActionSeq}`,
            timestampMs: workingState.simulationTimeMs,
            controlKey: key,
            value: nextValue,
          };

          const result = simulate(scenario, workingState, candidateAction, 0);
          workingState = result.state;
          appliedEvents.push(...result.events);
          groupChanges.push({
            controlKey: key,
            previousValue,
            newValue: nextValue,
          });
        }

        if (groupChanges.length === 0) return state;

        const trimmedReasoning = action.reasoning.trim();
        const nextGroupSeq = state.nextGroupSeq + 1;
        const group: CandidateActionGroup = {
          id: `candidate-group-${nextGroupSeq}`,
          elapsedMs: state.engineState.simulationTimeMs,
          reasoning: trimmedReasoning.length > 0 ? trimmedReasoning : null,
          changes: groupChanges,
        };

        const newTimelineEntries = toTimelineEntries(appliedEvents);

        return {
          ...state,
          engineState: workingState,
          timeline: [...state.timeline, ...newTimelineEntries],
          actionGroups: [...state.actionGroups, group],
          nextActionSeq,
          nextGroupSeq,
          ...queueUnsyncedEvents(state, newTimelineEntries),
        };
      }

      case "tick": {
        if (state.phase !== "active" || isLocallyTerminal(state.engineState, completionMode)) {
          return state;
        }

        const result = simulate(scenario, state.engineState, null, scenario.tickMs);
        const reachedLocalTerminal = isLocallyTerminal(result.state, completionMode);
        const nextPhase: AttemptPhase = reachedLocalTerminal ? "result" : state.phase;
        // Only ever set from local tick results for "resolved" (automatic
        // scenarios) or "failed" (every scenario, every mode) — a
        // candidate_declared scenario's "resolved" outcome is set
        // exclusively by the finish-resolved case below, never here,
        // since the engine itself never produces it locally in that mode.
        const nextOutcome = reachedLocalTerminal
          ? (result.state.status as "resolved" | "failed")
          : state.outcome;

        if (result.events.length === 0) {
          return { ...state, engineState: result.state, phase: nextPhase, outcome: nextOutcome };
        }

        const newTimelineEntries = toTimelineEntries(result.events);

        return {
          ...state,
          engineState: result.state,
          phase: nextPhase,
          outcome: nextOutcome,
          timeline: [...state.timeline, ...newTimelineEntries],
          ...queueUnsyncedEvents(state, newTimelineEntries),
        };
      }

      case "events-synced": {
        return {
          ...state,
          unsyncedEvents: state.unsyncedEvents.filter(
            (item) => item.sequence > action.throughSequence,
          ),
        };
      }

      case "resume-from-seed": {
        // Lands in "paused" — the candidate must explicitly resume before
        // the clock restarts, per Phase 4.1's "do not auto-restart before
        // the candidate explicitly resumes" requirement.
        const seed = action.seed;
        return {
          phase: "paused",
          engineState: seed.engineState,
          timeline: seed.timeline,
          actionGroups: seed.actionGroups,
          pendingControlValues: { ...seed.engineState.controlValues },
          nextActionSeq: 0,
          nextGroupSeq: seed.nextGroupSeq,
          attemptId: seed.attemptId,
          unsyncedEvents: [],
          nextEventSeq: seed.nextEventSeq,
          outcome: null,
          completionTier: null,
          finishing: false,
          finishError: null,
        };
      }

      case "resume-clock": {
        if (state.phase !== "paused") return state;
        return { ...state, phase: "active" };
      }

      case "finish-requested": {
        if (state.phase !== "active" || state.finishing) return state;
        return { ...state, finishing: true, finishError: null };
      }

      case "finish-resolved": {
        if (!state.finishing) return state;
        return {
          ...state,
          phase: "result",
          finishing: false,
          finishError: null,
          outcome: action.outcome,
          completionTier: action.completionTier,
        };
      }

      case "finish-failed": {
        if (!state.finishing) return state;
        return { ...state, finishing: false, finishError: action.error };
      }

      case "reset": {
        return createAttemptState(scenario);
      }

      default:
        return state;
    }
  };
}

export interface IncidentAttempt {
  phase: AttemptPhase;
  /** The persisted attempt id once one exists (signed-in practice),
   * null for anonymous practice (never persisted at all). Phase 6.1's
   * post-incident review endpoint needs this — see
   * requestActionFeedback in attempt-persistence.ts. */
  attemptId: string | null;
  state: SimulationState;
  timeline: TimelineEntry[];
  actionGroups: CandidateActionGroup[];
  pendingControlValues: Record<string, ControlValue>;
  hasPendingChanges: boolean;
  incidentStarted: boolean;
  incidentStartMs: number | null;
  /** Server-computed score for a terminal attempt, once the completion
   * request returns. Null until then — never a client-computed fallback. */
  serverScore: ServerScoreResult | null;
  /** True if the automatic terminal-scoring request failed (network error,
   * or a response with no score). serverScore stays null until a retry
   * succeeds — call retryScoring() to try again. */
  scoringError: boolean;
  /** Retries the automatic terminal-scoring request after scoringError. */
  retryScoring: () => void;
  /** The terminal outcome, once known — see IncidentOutcome's doc comment
   * for why this is the authoritative field to render from, never
   * `state.status === "resolved"` directly (which a candidate_declared
   * scenario's engine never locally produces). */
  outcome: IncidentOutcome | null;
  /** Which completion tier was achieved, for a resolved candidate_declared
   * attempt. Always null for automatic scenarios and for non-resolved
   * outcomes. */
  completionTier: CompletionTier | null;
  completionMode: "automatic" | "candidate_declared";
  /** True while a Finish request is in flight. */
  finishing: boolean;
  /** Set if the most recent Finish request failed — cleared on retry. */
  finishError: string | null;
  acknowledge: () => void;
  setPendingValue: (controlKey: string, value: ControlValue) => void;
  applyChanges: (reasoning: string) => void;
  resetAttempt: () => void;
  /** Transitions out of "paused" (resume) into "active", restarting the clock. */
  resumeClock: () => void;
  /** Candidate-declared completion (Phase 6.1) — only meaningful when
   * completionMode === "candidate_declared"; a no-op call for automatic
   * scenarios would be rejected server-side ("not_candidate_declared")
   * rather than silently succeeding. UI should only ever render/enable
   * the Finish control when completionMode is candidate_declared. */
  finishIncident: (note: string | null) => Promise<void>;
}

/**
 * Owns one Payment Retry Storm attempt end-to-end: engine state, the
 * accumulated system timeline, candidate action groups (change + reasoning
 * per Apply click), pending (unapplied) control edits, the 1Hz simulation
 * clock, and best-effort Phase 3 persistence (attempt creation, action
 * groups, events, and terminal completion). The engine itself is the only
 * source of incident behavior — this hook only calls into it, renders its
 * output, and durably records what happened.
 *
 * When `initialAttemptId` is provided (the Phase 4 assessment flow, where
 * the attempt row is created by the assessment-start API before this hook
 * even mounts) the hook skips practice-mode attempt creation and persists
 * action groups/events/completion against that attempt id directly — the
 * same persistence functions and the same simulation/scoring packages as
 * practice mode, per the Phase 4 instruction not to build a separate
 * assessment simulation path.
 *
 * When `resumeSeed` is provided (Phase 4.1 resume), the hook adopts an
 * already-reconstructed state (produced server-side by replaying
 * persisted action groups) instead of a fresh briefing, landing in a
 * "paused" phase. The candidate must explicitly call `resumeClock()`
 * before the tick interval starts — a refresh/return must never silently
 * restart the clock. `initialAttemptId` is ignored when `resumeSeed` is
 * provided (the seed already carries the attempt id).
 */
export function useIncidentAttempt(
  scenario: ScenarioSimulationDefinition,
  scenarioSlug: string,
  isSignedIn: boolean,
  initialAttemptId?: string | null,
  resumeSeed?: ResumeSeed | null,
): IncidentAttempt {
  const [state, dispatch] = useReducer(
    createReducer(scenario),
    scenario,
    createAttemptState,
  );
  // Server-computed score for the terminal result, set once the /complete
  // call returns. Never computed client-side for a signed-in attempt —
  // scoring bands (authored or built-in) are never trusted/recomputed in
  // the browser. Remains null if the attempt is still in flight, or if
  // the completion request failed (best-effort — see completeAttemptRecord).
  const [serverScore, setServerScore] = useState<ServerScoreResult | null>(null);
  // Set when the automatic-completion score request fails (network error,
  // non-2xx, or a 2xx with no score payload) so the UI can show a retry
  // affordance instead of an indefinite "Scoring…" with no feedback —
  // the bug class this guards against: completionSent latching true
  // before the request resolves meant a failed request previously left
  // serverScore null forever with nothing visibly wrong.
  const [scoringError, setScoringError] = useState(false);
  const [scoringRetryToken, setScoringRetryToken] = useState(0);

  // Guards so each persistence side effect fires exactly once per attempt,
  // even under React 19/StrictMode's double-invoke of effects in dev.
  const attemptCreationStarted = useRef(Boolean(initialAttemptId) || Boolean(resumeSeed));
  const persistedGroupCount = useRef(resumeSeed?.actionGroups.length ?? 0);
  const completionSent = useRef(false);
  const resumeSeedApplied = useRef(false);

  useEffect(() => {
    // phase is only ever "active" while isLocallyTerminal(engineState,
    // completionMode) is false — the reducer's "tick" case transitions to
    // "result" itself the instant that stops being true (see
    // isLocallyTerminal's doc comment: for candidate_declared scenarios
    // this means an automatic failure, never a sustained success, which
    // only ever ends the attempt via an explicit Finish). Checking phase
    // alone is therefore both necessary and sufficient here.
    if (state.phase !== "active") {
      return undefined;
    }

    const intervalId = setInterval(() => {
      dispatch({ type: "tick" });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [state.phase]);

  // Adopt a resumed seed (if provided) exactly once; otherwise, if an
  // assessment attempt was already created before this hook mounts,
  // adopt its id instead of creating a second practice-mode attempt.
  useEffect(() => {
    if (resumeSeed && !resumeSeedApplied.current) {
      resumeSeedApplied.current = true;
      dispatch({ type: "resume-from-seed", seed: resumeSeed });
      return;
    }
    if (!resumeSeed && initialAttemptId) {
      dispatch({ type: "attempt-created", attemptId: initialAttemptId });
    }
    // Only ever runs for the id/seed this hook instance was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracks the latest simulation-elapsed-time outside React state so
  // interval/event callbacks below always checkpoint a fresh value rather
  // than one captured stale at effect-subscription time.
  const latestElapsedMs = useRef(state.engineState.simulationTimeMs);
  useEffect(() => {
    latestElapsedMs.current = state.engineState.simulationTimeMs;
  }, [state.engineState.simulationTimeMs]);

  // Periodic elapsed-time checkpoint while actively ticking — never every
  // tick, a lightweight PATCH every CHECKPOINT_INTERVAL_MS instead. Fires
  // once immediately on becoming active too, so a checkpoint always
  // exists even if the candidate refreshes before the first interval
  // tick (otherwise lastSimulationTimeMs could stay null indefinitely).
  useEffect(() => {
    if (!state.attemptId || state.phase !== "active") {
      return undefined;
    }
    const attemptId = state.attemptId;

    void persistCheckpoint(attemptId, latestElapsedMs.current);
    const intervalId = setInterval(() => {
      void persistCheckpoint(attemptId, latestElapsedMs.current);
    }, CHECKPOINT_INTERVAL_MS);

    return () => clearInterval(intervalId);
    // The latest elapsed time is always read fresh via
    // latestElapsedMs.current at interval-fire time, not captured here.
  }, [state.attemptId, state.phase]);

  // Checkpoint immediately whenever the tab is hidden (backgrounded,
  // switched away from, or about to close) — best-effort, not relied on
  // alone per the spec (beforeunload is not guaranteed).
  useEffect(() => {
    if (!state.attemptId) return undefined;
    const attemptId = state.attemptId;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void persistCheckpoint(attemptId, latestElapsedMs.current);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [state.attemptId]);

  // Create the attempt record as soon as the candidate acknowledges.
  // Signed-out candidates on a free scenario play entirely in-browser —
  // no attempt record, no persistence, no network call at all.
  useEffect(() => {
    if (!isSignedIn || state.phase !== "active" || attemptCreationStarted.current) {
      return;
    }
    attemptCreationStarted.current = true;

    createAttemptRecord(scenarioSlug)
      .then((attemptId) => {
        if (attemptId) dispatch({ type: "attempt-created", attemptId });
      })
      .catch(() => undefined);
  }, [isSignedIn, state.phase, scenarioSlug]);

  // Persist each newly completed action group exactly once, in order, and
  // checkpoint the elapsed time at that same moment — an Apply Changes
  // click is always a meaningful resume point.
  useEffect(() => {
    if (!state.attemptId) return;
    if (persistedGroupCount.current >= state.actionGroups.length) return;

    const attemptId = state.attemptId;
    const toPersist = state.actionGroups.slice(persistedGroupCount.current);
    const startSequence = persistedGroupCount.current;
    persistedGroupCount.current = state.actionGroups.length;

    toPersist.forEach((group, offset) => {
      void persistActionGroup(attemptId, startSequence + offset, group);
    });
    void persistCheckpoint(attemptId, latestElapsedMs.current);
  }, [state.attemptId, state.actionGroups]);

  // Batch-flush any unsynced engine events whenever the queue changes.
  useEffect(() => {
    if (!state.attemptId || state.unsyncedEvents.length === 0) return;

    const attemptId = state.attemptId;
    const batch = state.unsyncedEvents;
    const throughSequence = batch[batch.length - 1]!.sequence;

    void persistEvents(attemptId, batch).then(() => {
      dispatch({ type: "events-synced", throughSequence });
    });
  }, [state.attemptId, state.unsyncedEvents]);

  // Persist the terminal result exactly once when the attempt resolves/fails
  // (signed-in: has a real attemptId). The score is always server-computed
  // — the browser never recomputes it from scoring bands.
  useEffect(() => {
    if (!state.attemptId || completionSent.current) return;
    if (state.engineState.status !== "resolved" && state.engineState.status !== "failed") {
      return;
    }
    completionSent.current = true;

    const scoringInputs = extractScoringInputs(scenario, state.engineState);
    void completeAttemptRecord(
      state.attemptId,
      state.engineState.status,
      scoringInputs,
      state.engineState,
    ).then((score) => {
      if (score) {
        setServerScore(score);
      } else {
        // Null means the request failed outright, or returned 2xx with
        // no score payload — either way, retry must be possible rather
        // than silently stalling on "Scoring…" forever.
        completionSent.current = false;
        setScoringError(true);
      }
    });
  }, [state.attemptId, state.engineState, scenario, scoringRetryToken]);

  // Anonymous counterpart: no attemptId exists (anonymous attempts are
  // never persisted), so request a stateless score preview instead —
  // still always server-computed, never recomputed in the browser. Only
  // reachable for scenarios anonymous users could start at all (free
  // scenarios); the endpoint itself re-verifies practice access.
  useEffect(() => {
    if (state.attemptId || isSignedIn || completionSent.current) return;
    if (state.engineState.status !== "resolved" && state.engineState.status !== "failed") {
      return;
    }
    completionSent.current = true;

    const scoringInputs = extractScoringInputs(scenario, state.engineState);
    void requestScorePreview(scenarioSlug, scoringInputs).then((score) => {
      if (score) {
        setServerScore(score);
      } else {
        completionSent.current = false;
        setScoringError(true);
      }
    });
  }, [state.attemptId, isSignedIn, state.engineState, scenario, scenarioSlug, scoringRetryToken]);

  const retryScoring = useCallback(() => {
    setScoringError(false);
    setScoringRetryToken((token) => token + 1);
  }, []);

  const acknowledge = useCallback(() => dispatch({ type: "acknowledge" }), []);

  const setPendingValue = useCallback(
    (controlKey: string, value: ControlValue) =>
      dispatch({ type: "set-pending-value", controlKey, value }),
    [],
  );

  const applyChanges = useCallback(
    (reasoning: string) => dispatch({ type: "apply-changes", reasoning }),
    [],
  );

  const resetAttempt = useCallback(() => {
    attemptCreationStarted.current = false;
    persistedGroupCount.current = 0;
    completionSent.current = false;
    setServerScore(null);
    setScoringError(false);
    dispatch({ type: "reset" });
  }, []);

  const resumeClock = useCallback(() => dispatch({ type: "resume-clock" }), []);

  // Phase 6.1: candidate-declared completion. Sends ONLY an idempotency
  // key, an optional note, and (for anonymous practice, which has no
  // persisted attemptId) the replayable public action history — never a
  // claimed status, outcome, or final state. The server independently
  // replays and decides; this hook adopts the server's answer directly
  // via "finish-resolved", never deriving the outcome from local
  // engineState.status (see IncidentOutcome's doc comment above).
  const finishIncident = useCallback(
    async (note: string | null) => {
      if (state.phase !== "active" || state.finishing) return;
      dispatch({ type: "finish-requested" });

      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `finish-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const response = state.attemptId
        ? await requestFinish(state.attemptId, requestId, note)
        : await requestFinishPreview(
            scenarioSlug,
            latestElapsedMs.current,
            state.actionGroups.map((group) => ({
              elapsedMs: group.elapsedMs,
              changes: group.changes.map((change) => ({
                controlKey: change.controlKey,
                value: change.newValue,
              })),
            })),
            note,
          );

      if ("error" in response) {
        dispatch({ type: "finish-failed", error: response.error });
        return;
      }

      dispatch({
        type: "finish-resolved",
        outcome: response.outcome,
        completionTier: response.completionTier,
      });
      if (response.score) setServerScore(response.score);
    },
    [state.phase, state.finishing, state.attemptId, state.actionGroups, scenarioSlug],
  );

  const hasPendingChanges = scenario.controls.some(
    (control) =>
      state.pendingControlValues[control.key] !== undefined &&
      state.pendingControlValues[control.key] !==
        state.engineState.controlValues[control.key],
  );

  const completionMode = scenario.completion?.mode ?? "automatic";

  return {
    phase: state.phase,
    attemptId: state.attemptId,
    state: state.engineState,
    timeline: state.timeline,
    actionGroups: state.actionGroups,
    pendingControlValues: state.pendingControlValues,
    hasPendingChanges,
    incidentStarted: hasIncidentStarted(state.engineState),
    incidentStartMs: incidentStartMs(scenario),
    serverScore,
    scoringError,
    retryScoring,
    outcome: state.outcome,
    completionTier: state.completionTier,
    completionMode,
    finishing: state.finishing,
    finishError: state.finishError,
    acknowledge,
    setPendingValue,
    applyChanges,
    resetAttempt,
    resumeClock,
    finishIncident,
  };
}
