"use client";

import type { ScoringInputs, SimulationState } from "@incidentrank/simulator";
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
