import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";
import { reviewPracticeAttemptFeedback } from "@/lib/server/action-feedback";

/**
 * Phase 6.1 "Post-Incident Practice Explanation": the only endpoint that
 * ever returns authored post-incident feedback text. Deliberately
 * practice-only and terminal-only — see reviewPracticeAttemptFeedback's
 * doc comment for the full rationale. Never called while an attempt is
 * still active; the practice console only fetches this once phase
 * becomes "result".
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

  const result = await reviewPracticeAttemptFeedback(owned.attempt);
  if (!result.ok) {
    if (result.reason === "not_practice") {
      return NextResponse.json(
        { error: "Post-incident feedback is only available for practice attempts." },
        { status: 403 },
      );
    }
    if (result.reason === "not_terminal") {
      return NextResponse.json(
        { error: "This attempt has not finished yet." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "This attempt's scenario version could not be resolved." },
      { status: 500 },
    );
  }

  return NextResponse.json({ actionGroups: result.actionGroups });
}
