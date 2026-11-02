import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { createChallenge } from "@/lib/server/challenge";
import { recordAnalyticsEvent } from "@/lib/server/analytics";

interface CreateChallengeBody {
  attemptId?: unknown;
}

/**
 * docs/implementation_plan/phase-challege-version.md §5/§6 — signed-in
 * only (enforced by proxy.ts's isProtectedRoute matching the bare
 * "/api/challenges" path). Returns the plaintext share token exactly
 * once; only its hash is ever persisted (see challenge.ts/
 * challenge-token.ts).
 */
export async function POST(request: Request) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CreateChallengeBody | null;
  if (typeof body?.attemptId !== "string") {
    return NextResponse.json({ error: "attemptId is required" }, { status: 400 });
  }

  const result = await createChallenge(user.id, body.attemptId);
  if (!result.ok) {
    const status = result.reason === "attempt_not_found" ? 404 : 403;
    return NextResponse.json(
      { error: "This attempt is not eligible to be shared as a challenge." },
      { status },
    );
  }

  void recordAnalyticsEvent({
    eventName: "challenge_created",
    userId: user.id,
    scenarioSlug: null,
    practiceOrAssessment: "practice",
  });

  return NextResponse.json({ token: result.token });
}
