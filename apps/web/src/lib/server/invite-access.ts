import "server-only";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  type Assessment,
  type AssessmentCandidate,
  type Organization,
} from "@incidentrank/db";
import { db } from "./db";
import { hashInviteToken } from "./invite-token";

export type LoadInviteResult =
  | {
      ok: true;
      candidate: AssessmentCandidate;
      assessment: Assessment;
      organization: Organization;
    }
  | { ok: false; reason: "not_found" };

/**
 * Looks up an invitation by its plaintext token. The token is never stored
 * directly — only its SHA-256 hash — so lookup hashes the supplied token
 * and compares against assessment_candidates.inviteTokenHash.
 */
export async function loadInviteByToken(
  token: string,
): Promise<LoadInviteResult> {
  const inviteTokenHash = hashInviteToken(token);

  const candidate = await db.query.assessmentCandidates.findFirst({
    where: eq(assessmentCandidates.inviteTokenHash, inviteTokenHash),
    with: {
      assessment: { with: { organization: true } },
    },
  });

  if (!candidate) return { ok: false, reason: "not_found" };

  const assessment = candidate.assessment;
  const organization = assessment?.organization;
  if (!assessment || !organization) return { ok: false, reason: "not_found" };

  return { ok: true, candidate, assessment, organization };
}
