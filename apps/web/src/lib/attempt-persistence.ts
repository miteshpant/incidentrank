"use client";

import type { ControlValue, ScoringInputs, SimulationState, SimulationEvent } from "@incidentrank/simulator";
import type { CandidateActionGroup, ResumeSeed, TimelineEntry } from "./use-incident-attempt";
import { toTimelineEntries } from "./use-incident-attempt";

/**
 * Best-effort persistence to the Phase 3 attempts API. Failures are logged
 * but never interrupt local play — the in-browser attempt is always the
 * source of truth for the live UI; the database is a durable record of it.
 */

export async function createAttemptRecord(
  scenarioSlug: string,
): Promise<string | null> {
  try {
    const response = await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioSlug }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { attempt?: { id?: string } };
    return data.attempt?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Looks up the candidate's own in-progress practice attempt for this
 * exact scenario, if one exists — called once on mount, before the
 * briefing screen renders, so a candidate who navigated away/refreshed
 * mid-incident is offered resume instead of silently starting a second,
 * orphaning attempt (POST /api/attempts is now idempotent against this
 * same row, but only the resume flow actually restores the candidate's
 * prior state rather than merely avoiding a duplicate).
 */
export async function findActiveAttempt(
  scenarioSlug: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `/api/attempts?scenarioSlug=${encodeURIComponent(scenarioSlug)}`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { attempt?: { id?: string } | null };
    return data.attempt?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches a full ResumeSeed for an in-progress practice attempt — the
 * server replays the attempt's own persisted action history through the
 * real engine (apps/web/src/lib/server/attempt-resume.ts) and returns
 * the reconstructed state; this function does no replay itself. Returns
 * null on any failure, including a 409 (the attempt is no longer
 * in_progress — raced to completion elsewhere), so callers fall back to
 * a fresh briefing rather than getting stuck.
 */
export async function fetchResumeSeed(attemptId: string): Promise<ResumeSeed | null> {
  try {
    const response = await fetch(`/api/attempts/${attemptId}/resume`);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      elapsedMs?: number;
      state?: SimulationState;
      events?: SimulationEvent[];
      actionGroups?: Array<{
        id: string;
        elapsedMs: number;
        reasoning: string | null;
        changes: Array<{
          controlKey: string;
          previousValue: ControlValue;
          newValue: ControlValue;
        }>;
      }>;
      nextActionGroupSequence?: number;
      nextEventSequence?: number;
    };
    if (
      data.state === undefined ||
      data.events === undefined ||
      data.actionGroups === undefined ||
      data.nextActionGroupSequence === undefined ||
      data.nextEventSequence === undefined
    ) {
      return null;
    }
    return {
      attemptId,
      engineState: data.state,
      timeline: toTimelineEntries(data.events),
      actionGroups: data.actionGroups.map((group) => ({
        id: group.id,
        elapsedMs: group.elapsedMs,
        reasoning: group.reasoning,
        changes: group.changes.map((change) => ({
          controlKey: change.controlKey,
          previousValue: change.previousValue,
          newValue: change.newValue,
        })),
      })),
      nextGroupSeq: data.nextActionGroupSequence,
      nextEventSeq: data.nextEventSequence,
    };
  } catch {
    return null;
  }
}

/**
 * Starts (or resumes) a candidate's one official assessment attempt. Unlike
 * createAttemptRecord, this is not best-effort: a failure means the
 * candidate cannot proceed, so callers surface the error rather than
 * silently continuing in local-only mode.
 */
export async function startAssessmentAttempt(
  assessmentId: string,
): Promise<{ attemptId: string } | { error: string }> {
  try {
    const response = await fetch(`/api/assessment/${assessmentId}/start`, {
      method: "POST",
    });
    const data = (await response.json()) as {
      attempt?: { id?: string };
      error?: string;
    };
    if (!response.ok || !data.attempt?.id) {
      return { error: data.error ?? "Failed to start assessment" };
    }
    return { attemptId: data.attempt.id };
  } catch {
    return { error: "Failed to start assessment" };
  }
}

export async function persistActionGroup(
  attemptId: string,
  sequence: number,
  group: CandidateActionGroup,
): Promise<void> {
  try {
    await fetch(`/api/attempts/${attemptId}/action-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sequence,
        elapsedMs: group.elapsedMs,
        reasoning: group.reasoning,
        changes: group.changes,
      }),
    });
  } catch {
    // Best-effort: local play continues regardless of persistence failures.
  }
}

export async function persistEvents(
  attemptId: string,
  events: Array<{ sequence: number; entry: TimelineEntry }>,
): Promise<void> {
  if (events.length === 0) return;
  try {
    await fetch(`/api/attempts/${attemptId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: events.map(({ sequence, entry }) => ({
          sequence,
          elapsedMs: entry.timestampMs,
          type: entry.type,
          message: entry.message,
          metadata: entry.metadata ?? null,
        })),
      }),
    });
  } catch {
    // Best-effort.
  }
}

/**
 * Persists the attempt's elapsed-simulation-time checkpoint (Phase 4.1
 * resume). Called on apply-changes, periodically, and on visibility
 * change — never every tick. Best-effort: a missed checkpoint only
 * widens the gap a later resume would need to replay from the prior
 * checkpoint, it never corrupts anything.
 */
export async function persistCheckpoint(
  attemptId: string,
  elapsedMs: number,
): Promise<void> {
  try {
    await fetch(`/api/attempts/${attemptId}/checkpoint`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elapsedMs }),
    });
  } catch {
    // Best-effort.
  }
}

export interface ServerScoreResult {
  total: number;
  breakdown: Record<string, number>;
}

/**
 * Completes an attempt server-side and returns the server-computed score.
 * The score is ALWAYS computed server-side (never recomputed in the
 * browser from authored scoring bands) — this return value is the only
 * legitimate way a client should learn a completed attempt's score for
 * any scenario that has a server round-trip (i.e. every signed-in
 * attempt). Returns null on failure — callers must handle a missing
 * score (e.g. a dropped network request) rather than falling back to
 * client-side recomputation.
 */
export async function completeAttemptRecord(
  attemptId: string,
  status: "resolved" | "failed",
  scoringInputs: ScoringInputs,
  finalState: SimulationState,
): Promise<ServerScoreResult | null> {
  try {
    const response = await fetch(`/api/attempts/${attemptId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, scoringInputs, finalState }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { score?: ServerScoreResult };
    return data.score ?? null;
  } catch {
    return null;
  }
}

/**
 * The anonymous-practice counterpart to completeAttemptRecord: scores a
 * finished local attempt server-side without creating or touching any
 * attempts row (anonymous attempts are never persisted at all). The
 * browser must never compute a score itself — this is the only
 * legitimate way an anonymous candidate's result screen learns a score,
 * for any built-in free scenario.
 */
export async function requestScorePreview(
  scenarioSlug: string,
  scoringInputs: ScoringInputs,
): Promise<ServerScoreResult | null> {
  try {
    const response = await fetch("/api/attempts/score-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioSlug, scoringInputs }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { score?: ServerScoreResult };
    return data.score ?? null;
  } catch {
    return null;
  }
}

export interface FinishResponse {
  outcome: "resolved" | "declared_unstable";
  completionTier: "optimal" | "acceptable" | null;
  score: ServerScoreResult | null;
  /** Server-authoritative recovery time — derived from the accepted
   * tier's sustain-start instant (deriveScoringResolvedAtMs), the same
   * value the server persists and scores against. Never recomputed from
   * client-side engine state, which no longer carries a resolvedAtMs for
   * any candidate-declared completion (Phase 7.1). Null for
   * declared_unstable or a scenario with no incidentStartedAtMs. */
  recoveryTimeMs: number | null;
}

/**
 * The candidate-facing response to a company-assessment Finish — never
 * outcome/completionTier/score (Phase 7.1 candidate score-privacy
 * doctrine, docs/implementation_plan/phase7.action.md). Practice attempts
 * keep receiving FinishResponse unchanged.
 */
export interface FinishSubmittedResponse {
  submitted: true;
}

/**
 * The candidate-declared "Finish Incident" completion request, for a
 * persisted (signed-in) attempt — practice or assessment alike. Sends
 * ONLY an idempotency key and an optional note; never a claimed status,
 * outcome, or final state. The server independently replays the
 * attempt's own persisted action history and elapsed-time checkpoint to
 * decide the real outcome — see apps/web/src/lib/server/finish-attempt.ts.
 * Not best-effort like the other persistence calls above: a failed Finish
 * must be surfaced to the candidate (they clicked a deliberate, confirmed
 * action), never silently swallowed.
 */
export async function requestFinish(
  attemptId: string,
  requestId: string,
  note: string | null,
): Promise<FinishResponse | FinishSubmittedResponse | { error: string }> {
  try {
    const response = await fetch(`/api/attempts/${attemptId}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, note }),
    });
    const data = (await response.json()) as
      | (Partial<FinishResponse> & { error?: string; submitted?: boolean })
      | { error: string };
    if (!response.ok) {
      const message = "error" in data ? data.error : undefined;
      return { error: message ?? "We couldn't finish that incident. Please try again." };
    }
    if ("submitted" in data && data.submitted) {
      return { submitted: true };
    }
    if (!("outcome" in data) || !data.outcome) {
      return { error: "We couldn't finish that incident. Please try again." };
    }
    return {
      outcome: data.outcome,
      completionTier: data.completionTier ?? null,
      score: data.score ?? null,
      recoveryTimeMs: data.recoveryTimeMs ?? null,
    };
  } catch {
    return { error: "We couldn't finish that incident. Please try again." };
  }
}

export interface FinishPreviewActionGroup {
  elapsedMs: number;
  changes: Array<{ controlKey: string; value: ControlValue }>;
}

/**
 * The anonymous-practice counterpart to requestFinish: no persisted
 * attempt row exists, so the client submits its replayable PUBLIC action
 * history (never a claimed final state/status/score) and the server
 * deterministically replays it through the same engine before deciding
 * the outcome — see apps/web/src/app/api/attempts/finish-preview/route.ts.
 */
export async function requestFinishPreview(
  scenarioSlug: string,
  elapsedMs: number,
  actionGroups: FinishPreviewActionGroup[],
  note: string | null,
): Promise<FinishResponse | { error: string }> {
  try {
    const response = await fetch("/api/attempts/finish-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioSlug, elapsedMs, actionGroups, note }),
    });
    const data = (await response.json()) as Partial<FinishResponse> & { error?: string };
    if (!response.ok || !data.outcome) {
      return { error: data.error ?? "We couldn't finish that incident. Please try again." };
    }
    return {
      outcome: data.outcome,
      completionTier: data.completionTier ?? null,
      score: data.score ?? null,
      recoveryTimeMs: data.recoveryTimeMs ?? null,
    };
  } catch {
    return { error: "We couldn't finish that incident. Please try again." };
  }
}

export interface ActionFeedbackChange {
  controlKey: string;
  previousValue: ControlValue;
  newValue: ControlValue;
  outcome: "beneficial" | "neutral" | "harmful";
  feedback: { title: string; explanation: string } | null;
}

export interface ActionFeedbackGroup {
  elapsedMs: number;
  changes: ActionFeedbackChange[];
}

/** Phase 10F — see @incidentrank/scenarios' IncidentNarrative. Mirrored here (not imported) so this client-side module stays free of any server-only package dependency. */
export interface IncidentNarrativeEntryDTO {
  label: string;
  value: number | string | undefined;
}

export interface IncidentNarrativeDTO {
  rootCause: IncidentNarrativeEntryDTO[];
  contributingFactors: IncidentNarrativeEntryDTO[];
  observedEffects: IncidentNarrativeEntryDTO[];
  context: IncidentNarrativeEntryDTO[];
}

export interface ActionFeedbackResult {
  actionGroups: ActionFeedbackGroup[];
  narrative: IncidentNarrativeDTO | null;
}

/**
 * Phase 6.1 "Post-Incident Practice Explanation": fetches authored
 * per-action feedback for a completed, signed-in PRACTICE attempt only
 * — see apps/web/src/lib/server/action-feedback.ts's doc comment for the
 * full leak-boundary rationale. Callers must only invoke this once an
 * attempt has reached a terminal phase; the server independently
 * enforces practice-only + terminal-only regardless. Anonymous practice
 * has no persisted attempt row for this to resolve against, so it is
 * out of scope here — null/empty is a legitimate "nothing to show"
 * result, not an error, if a caller requests it for an ineligible
 * attempt.
 */
export async function requestActionFeedback(
  attemptId: string,
): Promise<ActionFeedbackResult | { error: string; status?: number }> {
  try {
    const response = await fetch(`/api/attempts/${attemptId}/review`);
    const data = (await response.json()) as {
      actionGroups?: ActionFeedbackGroup[];
      narrative?: IncidentNarrativeDTO | null;
      error?: string;
    };
    if (!response.ok || !data.actionGroups) {
      return { error: data.error ?? "We couldn't load the post-incident review.", status: response.status };
    }
    return { actionGroups: data.actionGroups, narrative: data.narrative ?? null };
  } catch {
    return { error: "We couldn't load the post-incident review." };
  }
}
