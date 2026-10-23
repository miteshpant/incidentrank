"use client";

import type { ControlValue, ScoringInputs, SimulationState } from "@incidentrank/simulator";
import type { CandidateActionGroup, TimelineEntry } from "./use-incident-attempt";

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
): Promise<FinishResponse | { error: string }> {
  try {
    const response = await fetch(`/api/attempts/${attemptId}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, note }),
    });
    const data = (await response.json()) as Partial<FinishResponse> & { error?: string };
    if (!response.ok || !data.outcome) {
      return { error: data.error ?? "We couldn't finish that incident. Please try again." };
    }
    return { outcome: data.outcome, completionTier: data.completionTier ?? null, score: data.score ?? null };
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
    return { outcome: data.outcome, completionTier: data.completionTier ?? null, score: data.score ?? null };
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
): Promise<ActionFeedbackGroup[] | { error: string }> {
  try {
    const response = await fetch(`/api/attempts/${attemptId}/review`);
    const data = (await response.json()) as { actionGroups?: ActionFeedbackGroup[]; error?: string };
    if (!response.ok || !data.actionGroups) {
      return { error: data.error ?? "We couldn't load the post-incident review." };
    }
    return data.actionGroups;
  } catch {
    return { error: "We couldn't load the post-incident review." };
  }
}
