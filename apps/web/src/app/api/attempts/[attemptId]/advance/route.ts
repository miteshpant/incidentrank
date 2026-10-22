import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { advanceRuntime, loadOwnedAssessmentAttempt } from "@/lib/server/assessment-runtime";

/**
 * Server-authoritative time advancement (Phase 5.1). Takes no body —
 * deliberately: the server computes allowable elapsed progression from
 * its own stored `runtimeAnchoredAt` wall-clock anchor, never from a
 * client-supplied elapsed value, so a candidate manipulating their
 * browser clock or request payload cannot fast-forward (or rewind) the
 * incident. The client calls this periodically (every few seconds) while
 * the console is actively mounted and visible — not once per simulated
 * second — to keep request volume low while elapsed time still only ever
 * moves forward at the server's discretion.
 */
export async function POST(
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

  const result = await advanceRuntime(attemptId, owned.attempt);
  if (!result.ok) {
    if (result.reason === "terminal") {
      // Not an error — the attempt simply finished (possibly via a
      // concurrent request). Report current terminal status rather than
      // a 4xx/5xx so the client can transition to the result screen.
      return NextResponse.json({ attemptStatus: owned.attempt.status, isPaused: true });
    }
    console.error(`Failed to advance runtime for attempt ${attemptId}: ${result.reason}`);
    return NextResponse.json(
      { error: "We couldn't update this assessment. Your existing attempt has not been changed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    attemptStatus: result.attemptStatus,
    isPaused: result.isPaused,
    runtime: result.view,
  });
}
