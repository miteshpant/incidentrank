"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CompletionMode, ControlValue, RuntimeView, SimulationEvent } from "@incidentrank/simulator";
import type { CandidateActionGroup, TimelineEntry } from "./use-incident-attempt";
import { requestFinish, type ServerScoreResult } from "./attempt-persistence";

/** How often the client asks the server to advance authoritative time while the console is actively visible. Not once per simulated second — request volume stays low while elapsed time still only ever moves forward at the server's discretion. */
const ADVANCE_INTERVAL_MS = 4_000;

const CANDIDATE_EVENT_TYPES = new Set(["CONFIG_CHANGED", "CONFIG_CHANGE_REJECTED"]);

function toTimelineEntries(events: SimulationEvent[]): TimelineEntry[] {
  return events.map((event) => ({
    ...event,
    source: CANDIDATE_EVENT_TYPES.has(event.type) ? "you" : "system",
  }));
}

interface RawActionGroup {
  id: string;
  elapsedMs: number;
  reasoning: string | null;
  changes: Array<{ controlKey: string; previousValue: unknown; newValue: unknown }>;
}

function toActionGroups(groups: RawActionGroup[]): CandidateActionGroup[] {
  return groups.map((group) => ({
    id: group.id,
    elapsedMs: group.elapsedMs,
    reasoning: group.reasoning,
    changes: group.changes.map((change) => ({
      controlKey: change.controlKey,
      previousValue: change.previousValue as ControlValue,
      newValue: change.newValue as ControlValue,
    })),
  }));
}

type RuntimePhase = "loading" | "paused" | "active" | "result" | "error";

type AssessmentClientAttemptStatus =
  | "in_progress"
  | "resolved"
  | "failed"
  | "declared_unstable"
  | "timed_out"
  | "abandoned";

interface RuntimeApiShape {
  attemptStatus: AssessmentClientAttemptStatus;
  isPaused: boolean;
  runtime: RuntimeView;
  actionGroups?: RawActionGroup[];
  nextEventSequence?: number;
  error?: string;
}

interface AssessmentRuntimeState {
  phase: RuntimePhase;
  view: RuntimeView | null;
  timeline: TimelineEntry[];
  actionGroups: CandidateActionGroup[];
  pendingControlValues: Record<string, ControlValue>;
  outcome: AssessmentClientAttemptStatus | null;
  completionTier: "optimal" | "acceptable" | null;
  errorMessage: string | null;
}

/**
 * Candidate-facing runtime for server-authoritative assessment attempts
 * (Phase 5.1). Unlike `useIncidentAttempt`, this hook never calls
 * packages/simulator's `simulate()` itself and never receives a
 * `ScenarioSimulationDefinition` at all — it only talks to
 * `/api/attempts/[attemptId]/{runtime,advance,actions,pause}`, which
 * return a candidate-safe `RuntimeView` (architecture, controls, current
 * state, already-occurred events). Rules, timed-event definitions,
 * success/failure conditions, and scoring never reach this hook or the
 * browser it runs in — there is simply no code path here that could
 * receive them.
 *
 * Time only ever advances via the server: this hook polls
 * `POST .../advance` every ADVANCE_INTERVAL_MS while mounted, active,
 * and the tab is visible, and relies entirely on the server's own
 * `isPaused`/`attemptStatus` response to decide what to render next —
 * it never predicts or locally extrapolates elapsed time between polls.
 */
export function useAssessmentRuntime(attemptId: string): {
  phase: RuntimePhase;
  view: RuntimeView | null;
  timeline: TimelineEntry[];
  actionGroups: CandidateActionGroup[];
  pendingControlValues: Record<string, ControlValue>;
  hasPendingChanges: boolean;
  serverScore: ServerScoreResult | null;
  /** True if the automatic terminal-scoring fetch failed — serverScore
   * stays null until a retry succeeds. Call retryScoring() to retry. */
  scoringError: boolean;
  retryScoring: () => void;
  errorMessage: string | null;
  outcome: AssessmentClientAttemptStatus | null;
  completionTier: "optimal" | "acceptable" | null;
  completionMode: CompletionMode;
  finishing: boolean;
  finishError: string | null;
  setPendingValue: (controlKey: string, value: ControlValue) => void;
  applyChanges: (reasoning: string) => void;
  resumeClock: () => void;
  finishIncident: (note: string | null) => void;
} {
  const [state, setState] = useState<AssessmentRuntimeState>({
    phase: "loading",
    view: null,
    timeline: [],
    actionGroups: [],
    pendingControlValues: {},
    outcome: null,
    completionTier: null,
    errorMessage: null,
  });
  const [serverScore, setServerScore] = useState<ServerScoreResult | null>(null);
  const [scoringError, setScoringError] = useState(false);
  const [scoringRetryToken, setScoringRetryToken] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const isSubmitting = useRef(false);

  // `resetPendingValues`: true for a true state replacement (bootstrap, or
  // the response to the candidate's own action submission) — false for a
  // background `/advance` poll. A background poll must never clobber a
  // control edit the candidate has made but not yet applied: with no
  // guard here, the 4s advance interval would silently discard any
  // selection the candidate made in the few seconds before clicking
  // "Apply Changes," which is a real usability defect, not just a visual
  // flicker — the candidate's intended action would simply never reach
  // the server. Discovered via manual verification (Phase 5.1 Manual
  // Flow B), fixed here rather than worked around in the UI.
  const applyRuntimeResponse = useCallback(
    (data: RuntimeApiShape, resetPendingValues: boolean) => {
      setState((prev) => {
        const timeline = toTimelineEntries(data.runtime.events);
        const actionGroups = data.actionGroups ? toActionGroups(data.actionGroups) : prev.actionGroups;
        // The server already applies the Phase 6.1 candidate_declared
        // gate (assessment-runtime.ts's isLocallyTerminal) before ever
        // reporting a terminal attemptStatus — resolved only ever arrives
        // here via a real Finish declaration. This client-side check is
        // purely about which phase to render, never a second decision.
        const isTerminal =
          data.attemptStatus === "resolved" ||
          data.attemptStatus === "failed" ||
          data.attemptStatus === "declared_unstable" ||
          data.attemptStatus === "timed_out";
        const nextPhase: RuntimePhase = isTerminal ? "result" : data.isPaused ? "paused" : "active";

        return {
          phase: nextPhase,
          view: data.runtime,
          // Already-occurred system events are the full authoritative
          // timeline each time (the server always returns "all events that
          // have occurred so far", not a delta) — never locally accumulated,
          // so a dropped poll can never cause duplicate or missing entries.
          timeline,
          actionGroups,
          pendingControlValues: resetPendingValues
            ? { ...data.runtime.state.controlValues }
            : prev.pendingControlValues,
          outcome: isTerminal ? data.attemptStatus : prev.outcome,
          completionTier: prev.completionTier,
          errorMessage: null,
        };
      });
    },
    [],
  );

  const bootstrap = useCallback(() => {
    fetch(`/api/attempts/${attemptId}/runtime`)
      .then(async (response) => {
        const data = (await response.json()) as RuntimeApiShape;
        if (!response.ok) {
          setState((prev) => ({ ...prev, phase: "error", errorMessage: data.error ?? "Failed to load" }));
          return;
        }
        applyRuntimeResponse(data, true);
      })
      .catch(() => {
        setState((prev) => ({ ...prev, phase: "error", errorMessage: "Failed to load assessment" }));
      });
  }, [attemptId, applyRuntimeResponse]);

  useEffect(() => {
    bootstrap();
    // Only on mount — subsequent state comes from advance/action responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic server-authoritative time advancement, only while active and
  // the tab is visible. Paused/result/error/loading phases never poll.
  useEffect(() => {
    if (state.phase !== "active") return undefined;

    const advance = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/attempts/${attemptId}/advance`, { method: "POST" })
        .then(async (response) => {
          const data = (await response.json()) as RuntimeApiShape;
          if (response.ok) applyRuntimeResponse(data, false);
        })
        .catch(() => undefined);
    };

    const intervalId = setInterval(advance, ADVANCE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [attemptId, state.phase, applyRuntimeResponse]);

  // Pause the server clock when the tab is hidden; resume (re-bootstrap)
  // when it becomes visible again — mirrors Phase 4.1's visibilitychange
  // checkpoint, enforced server-side instead of merely client-side.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void fetch(`/api/attempts/${attemptId}/pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pause" }),
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [attemptId]);

  // Fetch the server-computed score once a terminal result is reached.
  // Scoring was already computed and persisted server-side the moment the
  // triggering advance/action call detected the terminal transition
  // (assessment-runtime.ts's persistTerminalResult) — this is purely a
  // read of that already-stored result, never a recomputation.
  useEffect(() => {
    if (state.phase !== "result" || serverScore) return;
    const attempt = state.view?.state.status;
    if (attempt !== "resolved" && attempt !== "failed") return;

    fetch(`/api/attempts/${attemptId}`)
      .then(async (response) => {
        if (!response.ok) {
          setScoringError(true);
          return;
        }
        const data = (await response.json()) as {
          attempt?: {
            score?: number | null;
            recoveryScore?: number | null;
            customerImpactScore?: number | null;
            dataIntegrityScore?: number | null;
            reliabilityScore?: number | null;
            costEfficiencyScore?: number | null;
            operationalEfficiencyScore?: number | null;
          };
        };
        if (data.attempt?.score == null) {
          // Either malformed response, or a genuine race (the terminal
          // persist hadn't landed yet when this fetched) — either way,
          // retry must be possible rather than leaving serverScore null
          // forever with no visible error.
          setScoringError(true);
          return;
        }
        setServerScore({
          total: data.attempt.score,
          breakdown: {
            recovery: data.attempt.recoveryScore ?? 0,
            customerImpact: data.attempt.customerImpactScore ?? 0,
            dataIntegrity: data.attempt.dataIntegrityScore ?? 0,
            reliability: data.attempt.reliabilityScore ?? 0,
            costEfficiency: data.attempt.costEfficiencyScore ?? 0,
            operationalEfficiency: data.attempt.operationalEfficiencyScore ?? 0,
          },
        });
      })
      .catch(() => setScoringError(true));
  }, [attemptId, state.phase, state.view, serverScore, scoringRetryToken]);

  const retryScoring = useCallback(() => {
    setScoringError(false);
    setScoringRetryToken((token) => token + 1);
  }, []);

  const setPendingValue = useCallback((controlKey: string, value: ControlValue) => {
    setState((prev) => ({
      ...prev,
      pendingControlValues: { ...prev.pendingControlValues, [controlKey]: value },
    }));
  }, []);

  const applyChanges = useCallback(
    (reasoning: string) => {
      if (isSubmitting.current) return;
      setState((prev) => {
        if (!prev.view) return prev;
        const changes = Object.entries(prev.pendingControlValues)
          .filter(([key, value]) => value !== prev.view!.state.controlValues[key])
          .map(([controlKey, value]) => ({ controlKey, value }));
        if (changes.length === 0) return prev;

        isSubmitting.current = true;
        const actionRequestId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        fetch(`/api/attempts/${attemptId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionRequestId, changes, reasoning }),
        })
          .then(async (response) => {
            const data = (await response.json()) as RuntimeApiShape;
            if (response.ok) applyRuntimeResponse(data, true);
          })
          .catch(() => undefined)
          .finally(() => {
            isSubmitting.current = false;
          });

        return prev;
      });
    },
    [attemptId, applyRuntimeResponse],
  );

  const resumeClock = useCallback(() => {
    fetch(`/api/attempts/${attemptId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    })
      .then(() => bootstrap())
      .catch(() => undefined);
  }, [attemptId, bootstrap]);

  // The candidate's explicit "I'm done" declaration for a
  // candidate_declared assessment scenario. Reuses requestFinish — the
  // exact same server call signed-in practice uses — since finishAttempt
  // (apps/web/src/lib/server/finish-attempt.ts) already authorizes and
  // operates identically for assessment attempts: only persistence/auth
  // context differs, never the completion decision itself (Phase 6.1's
  // binding "same simulator, same completion evaluator, same scorer"
  // decision). Sends only an idempotency key and the optional note —
  // never a claimed outcome/state/score.
  const finishIncident = useCallback(
    (note: string | null) => {
      if (finishing) return;
      setFinishing(true);
      setFinishError(null);

      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `finish-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      requestFinish(attemptId, requestId, note)
        .then((result) => {
          if ("error" in result) {
            setFinishError(result.error);
            return;
          }
          setState((prev) => ({
            ...prev,
            phase: "result",
            outcome: result.outcome,
            completionTier: result.completionTier,
          }));
          if (result.score) setServerScore(result.score);
        })
        .catch(() => {
          setFinishError("We couldn't finish that incident. Please try again.");
        })
        .finally(() => {
          setFinishing(false);
        });
    },
    [attemptId, finishing],
  );

  const hasPendingChanges = state.view
    ? Object.entries(state.pendingControlValues).some(
        ([key, value]) => value !== state.view!.state.controlValues[key],
      )
    : false;

  return {
    phase: state.phase,
    view: state.view,
    timeline: state.timeline,
    actionGroups: state.actionGroups,
    pendingControlValues: state.pendingControlValues,
    hasPendingChanges,
    serverScore,
    scoringError,
    retryScoring,
    errorMessage: state.errorMessage,
    outcome: state.outcome,
    completionTier: state.completionTier,
    completionMode: state.view?.completionMode ?? "automatic",
    finishing,
    finishError,
    setPendingValue,
    applyChanges,
    resumeClock,
    finishIncident,
  };
}
