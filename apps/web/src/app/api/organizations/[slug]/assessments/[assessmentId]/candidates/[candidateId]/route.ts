import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrgCandidate } from "@/lib/server/assessment-access";

/**
 * Company-side candidate result detail. Authorization is scoped entirely
 * through loadOrgCandidate: organization membership → assessment ownership
 * → candidate ownership → (only then) the linked attempt. This route never
 * accepts or trusts an attemptId directly from the client — the only path
 * to an attempt here is through the candidate row's own attemptId column,
 * which is itself set exclusively by the invitation-acceptance/assessment
 * start server flow. This is the privacy boundary: a company can reach
 * only attempts linked through its own assessments, never a candidate's
 * other practice or assessment history.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ slug: string; assessmentId: string; candidateId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, assessmentId, candidateId } = await params;
  const result = await loadOrgCandidate(slug, assessmentId, candidateId, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "Not found" : "Forbidden" },
      { status: result.status },
    );
  }

  if (!result.candidate.attemptId) {
    return NextResponse.json({
      assessment: result.assessment,
      candidate: result.candidate,
      attempt: null,
    });
  }

  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, result.candidate.attemptId),
    with: {
      scenario: true,
      actionGroups: {
        orderBy: (table, { asc }) => [asc(table.sequence)],
        with: { changes: { orderBy: (table, { asc }) => [asc(table.sequence)] } },
      },
      events: { orderBy: (table, { asc }) => [asc(table.sequence)] },
    },
  });

  return NextResponse.json({
    assessment: result.assessment,
    candidate: result.candidate,
    attempt,
  });
}
