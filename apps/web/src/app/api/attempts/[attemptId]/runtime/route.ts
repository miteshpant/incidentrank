import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { bootstrapRuntime, loadOwnedAssessmentAttempt } from "@/lib/server/assessment-runtime";

/**
 * The server-authoritative assessment runtime bootstrap/resume endpoint
 * (Phase 5.1), replacing the old client-replay-driven resume flow for
 * `attemptType: "assessment"` attempts. Reconstructs current engine
 * state server-side and returns only the candidate-safe RuntimeView —
 * never the scenario's rules, timed events, success/failure conditions,
 * or scoring configuration, since those simply have no field on
 * RuntimeView to be returned through. A fresh mount and a refresh/return
 * visit are the same request: there is no separate "start" reconstruction
 * path, because server-held state is always authoritative.
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
  const owned = await loadOwnedAssessmentAttempt(attemptId, user.id);
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 404 ? "Not found" : "Forbidden" },
      { status: owned.status },
    );
  }

  const result = await bootstrapRuntime(owned.attempt);
  if (!result.ok) {
    console.error(`Failed to bootstrap runtime for attempt ${attemptId}: ${result.reason}`);
    return NextResponse.json(
      { error: "We couldn't load this assessment. Your existing attempt has not been changed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    attemptStatus: result.attemptStatus,
    isPaused: result.isPaused,
    runtime: result.view,
    actionGroups: result.actionGroups,
    nextEventSequence: result.nextEventSequence,
  });
}
