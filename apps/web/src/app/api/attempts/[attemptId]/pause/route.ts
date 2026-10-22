import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import {
  loadOwnedAssessmentAttempt,
  pauseRuntimeClock,
  resumeRuntimeClock,
} from "@/lib/server/assessment-runtime";

interface PauseBody {
  action?: unknown;
}

/**
 * Toggles the server-authoritative runtime clock (Phase 5.1). "pause" is
 * called on tab-hidden/navigate-away (best-effort, mirroring Phase 4.1's
 * visibilitychange checkpoint) and "resume" is called when the candidate
 * explicitly clicks "Resume Assessment" after a refresh/return — the
 * clock never restarts implicitly on its own, matching Phase 4.1's
 * pause policy exactly, just enforced server-side: while
 * `runtimeAnchoredAt` is null, advanceRuntime always no-ops regardless of
 * how much real time has passed.
 */
export async function POST(
  request: Request,
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

  const body = (await request.json().catch(() => null)) as PauseBody | null;
  if (body?.action !== "pause" && body?.action !== "resume") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (body.action === "pause") {
    await pauseRuntimeClock(attemptId);
  } else {
    await resumeRuntimeClock(attemptId);
  }

  return NextResponse.json({ ok: true });
}
