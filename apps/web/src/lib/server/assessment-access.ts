import "server-only";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  type Assessment,
  type AssessmentCandidate,
  type Organization,
  type OrganizationMember,
  type User,
} from "@incidentrank/db";
import { db } from "./db";
import { loadOrganizationMembership } from "./organization-auth";

export type LoadOrgAssessmentResult =
  | { ok: true; assessment: Assessment; membership: OrganizationMember; organization: Organization }
  | { ok: false; status: 404 | 403 };

/**
 * Loads an assessment and verifies (a) the given user is a member of the
 * owning organization and (b) the assessment actually belongs to the
 * organization identified by `orgSlug`. This is the privacy boundary for
 * every company-facing assessment route: company access is scoped to
 * assessment-linked attempts only, per docs/architecture.md.
 */
export async function loadOrgAssessment(
  orgSlug: string,
  assessmentId: string,
  user: User,
): Promise<LoadOrgAssessmentResult> {
  const membership = await loadOrganizationMembership(orgSlug, user);
  if (!membership.ok) return { ok: false, status: membership.status };

  const assessment = await db.query.assessments.findFirst({
    where: eq(assessments.id, assessmentId),
  });
  if (!assessment || assessment.organizationId !== membership.organization.id) {
    return { ok: false, status: 404 };
  }

  return {
    ok: true,
    assessment,
    membership: membership.membership,
    organization: membership.organization,
  };
}

export type AssessmentCandidateWithUser = AssessmentCandidate & {
  user: User | null;
};

export type LoadOrgCandidateResult =
  | {
      ok: true;
      assessment: Assessment;
      candidate: AssessmentCandidateWithUser;
      membership: OrganizationMember;
      organization: Organization;
    }
  | { ok: false; status: 404 | 403 };

/**
 * Loads an assessment candidate row and verifies it belongs to an
 * assessment owned by the organization the signed-in user is a member of.
 * This is the only path a hiring-team member uses to reach a candidate's
 * assessment attempt — it never trusts a client-supplied attemptId
 * directly, and it never grants access to any attempt not linked through
 * this exact assessment/candidate chain.
 */
export async function loadOrgCandidate(
  orgSlug: string,
  assessmentId: string,
  candidateId: string,
  user: User,
): Promise<LoadOrgCandidateResult> {
  const assessmentResult = await loadOrgAssessment(orgSlug, assessmentId, user);
  if (!assessmentResult.ok) return assessmentResult;

  const candidate = await db.query.assessmentCandidates.findFirst({
    where: eq(assessmentCandidates.id, candidateId),
    with: { user: true },
  });
  if (!candidate || candidate.assessmentId !== assessmentResult.assessment.id) {
    return { ok: false, status: 404 };
  }

  return {
    ok: true,
    assessment: assessmentResult.assessment,
    candidate,
    membership: assessmentResult.membership,
    organization: assessmentResult.organization,
  };
}
