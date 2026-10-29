import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assessmentCandidates, assessments, attempts, organizations } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { isOrgCreditConsumptionEnabled } from "@/lib/server/feature-flags";
import { consumeOrganizationCreditForAttempt } from "@/lib/server/organization-credits";
import { logOrgAuditEvent } from "@/lib/server/organization-audit";
import { requireCurrentAssessmentNotice } from "@/lib/server/legal-acceptance";

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
 *
 * Phase 10B §23-§28: a brand-new attempt additionally requires an
 * available organization assessment credit. The org-active check,
 * balance verification, attempt creation, and -1 ledger write all
 * happen inside one transaction (§24 — never "check balance, COMMIT,
 * later consume" as separate unsafe steps), with
 * consumeOrganizationCreditForAttempt locking the organization's ledger
 * rows for the duration so two concurrent candidates racing for the
 * last credit cannot both succeed (§25). The candidate-facing error
 * message deliberately never reveals billing internals (§34).
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
    // Already started — one official attempt only, no restart, and no
    // additional credit is ever consumed on resume/refresh (§27).
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

  // Phase 10D §23/§25: a brand-new attempt requires current-version
  // acknowledgment of the candidate assessment notice, enforced
  // server-side (never only a UI checkbox). This check runs AFTER the
  // resume-first early return above, so an already-started attempt is
  // never blocked by a later notice-version change (§25's explicit
  // "do not strand an in-progress candidate").
  const hasNotice = await requireCurrentAssessmentNotice(
    user.id,
    assessment.organizationId,
    assessment.id,
  );
  if (!hasNotice) {
    return NextResponse.json(
      { error: "assessment_notice_required" },
      { status: 403 },
    );
  }

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, assessment.organizationId),
  });
  if (!organization || organization.status !== "active") {
    return NextResponse.json(
      { error: "This assessment is temporarily unavailable. Please contact the organization that invited you." },
      { status: 403 },
    );
  }

  // Sentinel used to force a transaction rollback (discarding the
  // just-inserted attempt row) when no credit is available, without
  // surfacing a 500 — db.transaction only rolls back on a thrown error,
  // never on a plain returned value, so "no credit" must throw.
  class NoCreditAvailableError extends Error {}

  try {
    const result = await db.transaction(async (tx) => {
      // Re-check inside the transaction: another request may have
      // started this exact candidate's attempt between the reads above
      // and acquiring the lock below (duplicate-start race, §28).
      const freshCandidate = await tx.query.assessmentCandidates.findFirst({
        where: eq(assessmentCandidates.id, candidate.id),
      });
      if (freshCandidate?.attemptId) {
        const existingAttempt = await tx.query.attempts.findFirst({
          where: eq(attempts.id, freshCandidate.attemptId),
        });
        return { attempt: existingAttempt, candidate: freshCandidate };
      }

      const [attempt] = await tx
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
        throw new Error("Failed to start assessment attempt");
      }

      if (isOrgCreditConsumptionEnabled()) {
        const consumption = await consumeOrganizationCreditForAttempt(tx, {
          organizationId: organization.id,
          assessmentId: assessment.id,
          attemptId: attempt.id,
        });
        if (!consumption.ok) {
          throw new NoCreditAvailableError();
        }
        if (consumption.inserted) {
          await logOrgAuditEvent(tx, {
            organizationId: organization.id,
            actorUserId: user.id,
            actorType: "system",
            action: "assessment_credit_consumed",
            targetType: "attempt",
            targetId: attempt.id,
            metadata: { assessmentId: assessment.id },
          });
        }
      }

      const [updatedCandidate] = await tx
        .update(assessmentCandidates)
        .set({ status: "started", startedAt: new Date(), attemptId: attempt.id })
        .where(eq(assessmentCandidates.id, candidate.id))
        .returning();

      return { attempt, candidate: updatedCandidate };
    });

    return NextResponse.json({ attempt: result.attempt, candidate: result.candidate });
  } catch (error) {
    if (error instanceof NoCreditAvailableError) {
      return NextResponse.json(
        { error: "This assessment is temporarily unavailable. Please contact the organization that invited you." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Failed to start assessment attempt" },
      { status: 500 },
    );
  }
}
