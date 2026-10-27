import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assessmentCandidates, assessments, attempts, organizations } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";

/**
 * Starts a candidate's one official assessment attempt. Authorization here
 * is entirely candidate-identity based (no organization membership
 * involved — a candidate is never a member of the hiring org just by being
 * assessed): the signed-in user must already be the claimed owner of an
 * `assessment_candidates` row for this assessment (set by the invite
 * accept flow). A second start attempt is rejected — Phase 4 grants
 * exactly one official attempt, no "Try Again".
 *
 * Phase 10A §17/§18: a brand-new attempt must not start against a
 * suspended organization's assessment, but an already-started attempt
 * (candidate.attemptId already set) must always be resumable regardless
 * of organization status — the early return below for that case runs
 * BEFORE the organization-status check, so resuming is never blocked by
 * suspension (this is the one case §18 explicitly protects).
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

  if (candidate.attemptId) {
    // Already started — one official attempt only, no restart.
    const existingAttempt = await db.query.attempts.findFirst({
      where: eq(attempts.id, candidate.attemptId),
    });
    return NextResponse.json({ attempt: existingAttempt, candidate });
  }

  if (assessment.status !== "active") {
    return NextResponse.json(
      { error: "This assessment is not currently accepting starts" },
      { status: 403 },
    );
  }

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, assessment.organizationId),
    columns: { status: true },
  });
  if (organization?.status === "suspended") {
    return NextResponse.json(
      { error: "This organization is currently suspended and cannot accept new assessment starts" },
      { status: 403 },
    );
  }

  const [attempt] = await db
    .insert(attempts)
    .values({
      userId: user.id,
      scenarioId: assessment.scenarioId,
      scenarioVersion: assessment.scenarioVersion,
      attemptType: "assessment",
      assessmentId: assessment.id,
      status: "in_progress",
    })
    .returning();

  if (!attempt) {
    return NextResponse.json(
      { error: "Failed to start assessment attempt" },
      { status: 500 },
    );
  }

  const [updatedCandidate] = await db
    .update(assessmentCandidates)
    .set({ status: "started", startedAt: new Date(), attemptId: attempt.id })
    .where(eq(assessmentCandidates.id, candidate.id))
    .returning();

  return NextResponse.json({ attempt, candidate: updatedCandidate });
}
