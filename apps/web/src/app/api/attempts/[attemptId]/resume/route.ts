import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";
import { loadResumeData } from "@/lib/server/attempt-resume";

/**
 * Reconstructs an in-progress attempt's current state for resume
 * (candidate refresh/return flow). Never replays a terminal attempt as
 * active — callers must check attempt.status themselves before calling
 * this (the candidate landing page already branches on attemptStatus).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attemptId } = await params;
  const owned = await loadOwnedAttempt(attemptId, user);
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 404 ? "Not found" : "Forbidden" },
      { status: owned.status },
    );
  }

  if (owned.attempt.status !== "in_progress") {
    return NextResponse.json(
      { error: "This attempt is no longer in progress" },
      { status: 409 },
    );
  }

  const result = await loadResumeData(attemptId);
  if (!result.ok) {
    // Log enough to diagnose in development without exposing internals to
    // the candidate.
    console.error(
      `Failed to reconstruct attempt ${attemptId} for resume: ${result.reason}`,
    );
    return NextResponse.json(
      {
        error:
          "We couldn't restore this assessment. Your existing attempt has not been changed.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    elapsedMs: owned.attempt.lastSimulationTimeMs,
    state: result.state,
    events: result.events,
    actionGroups: result.actionGroups,
    nextActionGroupSequence: result.nextActionGroupSequence,
    nextEventSequence: result.nextEventSequence,
  });
}
