import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";
import { finishAttempt } from "@/lib/server/finish-attempt";

interface FinishAttemptBody {
  requestId?: unknown;
  note?: unknown;
}

const MAX_NOTE_LENGTH = 1000;

/**
 * The candidate-declared "Finish Incident" completion endpoint
 * (docs/implementation_plan/phase6.1.md) — server-authoritative for both
 * signed-in practice and assessment attempts alike (the same binding
 * decision that governs POST .../finish-preview for anonymous practice).
 * The client sends only an idempotency key and an optional note — never a
 * claimed status or score. The server replays the attempt's persisted
 * action history to reconstruct authoritative state, evaluates whether
 * the scenario's completion criteria are currently satisfied, computes
 * the score, and persists the terminal result. No hidden success/
 * acceptable thresholds are ever returned to the client, before or after
 * completion.
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
  const owned = await loadOwnedAttempt(attemptId, user);
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 404 ? "Not found" : "Forbidden" },
      { status: owned.status },
    );
  }

  const body = (await request.json().catch(() => null)) as FinishAttemptBody | null;

  if (typeof body?.requestId !== "string" || body.requestId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid finish payload" }, { status: 400 });
  }

  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return NextResponse.json({ error: "Invalid finish payload" }, { status: 400 });
  }
  if (typeof body.note === "string" && body.note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Completion note must be ${MAX_NOTE_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }
  const note = typeof body.note === "string" && body.note.trim().length > 0 ? body.note : null;

  const result = await finishAttempt(owned.attempt, body.requestId, note);

  if (!result.ok) {
    if (result.reason === "terminal") {
      return NextResponse.json({ error: "This attempt has already finished" }, { status: 409 });
    }
    if (result.reason === "not_candidate_declared") {
      return NextResponse.json(
        { error: "This scenario does not support candidate-declared completion" },
        { status: 400 },
      );
    }
    console.error(`Failed to finish attempt ${attemptId}: ${result.reason}`);
    return NextResponse.json(
      { error: "We couldn't finish that incident. Your existing attempt has not been changed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    outcome: result.result.outcome,
    completionTier: result.result.completionTier,
    score: result.result.score,
  });
}
