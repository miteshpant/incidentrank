import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assessments } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { recordLegalAcceptance } from "@/lib/server/legal-acceptance";

/**
 * Phase 10D §24. Records a candidate's acknowledgment of the current
 * assessment notice for exactly this (assessment, organization) pair.
 * organizationId/assessmentId are always derived server-side from the
 * assessment row itself — never accepted from the client — and
 * authorization mirrors the start route's own candidate-identity check
 * (the signed-in user must already own an assessment_candidates row for
 * this assessment; otherwise there is nothing to acknowledge on their
 * behalf).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assessmentId } = await params;

  const assessment = await db.query.assessments.findFirst({
    where: eq(assessments.id, assessmentId),
  });
  if (!assessment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const candidate = await db.query.assessmentCandidates.findFirst({
    where: (table, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(table.assessmentId, assessmentId), eqFn(table.userId, user.id)),
  });
  if (!candidate) {
    return NextResponse.json(
      { error: "You have not been invited to this assessment" },
      { status: 403 },
    );
  }

  await recordLegalAcceptance(user.id, "candidate_assessment_notice", {
    organizationId: assessment.organizationId,
    assessmentId: assessment.id,
  });

  return NextResponse.json({ ok: true });
}
