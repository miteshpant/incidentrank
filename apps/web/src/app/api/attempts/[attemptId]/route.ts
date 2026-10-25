import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";
import { redactAttemptForCandidate } from "@/lib/server/redact-attempt-for-candidate";

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

  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
  });

  // Phase 7.1: company-assessment candidates must never receive
  // evaluation-derived results (score, dimension breakdowns, completion
  // tier, outcome, etc.) — see redact-attempt-for-candidate.ts. This is
  // the only response this route has ever returned the full raw
  // `attempts` row for (no caller reads the scenario/actionGroups/events
  // relations this route used to also fetch, so they're dropped
  // entirely rather than redacted field-by-field).
  return NextResponse.json({
    attempt: attempt ? redactAttemptForCandidate(attempt) : null,
  });
}
