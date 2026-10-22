import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { assessmentCandidates } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadInviteByToken } from "@/lib/server/invite-access";
import { normalizeEmail } from "@/lib/server/invite-token";

/**
 * Preview an invitation without requiring sign-in yet, so the candidate
 * landing page can show "You've been invited to ... for <Org>" before
 * authentication. Never exposes the invite token hash or any other
 * candidate's data — only this one invite's organization/assessment name
 * and its own status.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await loadInviteByToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  const alreadyClaimed = result.candidate.userId !== null;
  // An already-claimed candidate never depends on the token again — only
  // an unclaimed, expired invitation is reported as expired.
  const expired = !alreadyClaimed && result.candidate.inviteExpiresAt < new Date();

  return NextResponse.json({
    organizationName: result.organization.name,
    assessmentName: result.assessment.name,
    assessmentStatus: result.assessment.status,
    candidateStatus: result.candidate.status,
    candidateEmail: result.candidate.email,
    alreadyClaimed,
    expired,
  });
}

/**
 * Accept the invitation. Candidate identity binding: Clerk's verified
 * primary email for the signed-in user must case-insensitively match the
 * email the invitation was created for. This is enforced here because
 * Clerk's primary email is verified at sign-up/sign-in for the email
 * strategy, making it a trustworthy binding key without inventing custom
 * matching logic. If the signed-in user has no verified primary email,
 * acceptance is rejected rather than silently allowed.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  const result = await loadInviteByToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  if (result.candidate.userId !== null) {
    if (result.candidate.userId === user.id) {
      return NextResponse.json({ candidate: result.candidate });
    }
    // Already claimed by a different user — an invitation must not later
    // be claimable by another user.
    return NextResponse.json(
      { error: "This invitation has already been claimed" },
      { status: 409 },
    );
  }

  if (result.candidate.inviteExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "This invitation has expired" },
      { status: 410 },
    );
  }

  const clerkUser = await currentUser();
  const verifiedEmail = clerkUser?.emailAddresses.find(
    (addr) =>
      addr.id === clerkUser.primaryEmailAddressId &&
      addr.verification?.status === "verified",
  )?.emailAddress;

  if (!verifiedEmail) {
    return NextResponse.json(
      { error: "A verified email address is required to accept this invitation" },
      { status: 403 },
    );
  }

  if (normalizeEmail(verifiedEmail) !== result.candidate.normalizedEmail) {
    return NextResponse.json(
      {
        error:
          "Your signed-in account's email does not match the email this invitation was sent to",
      },
      { status: 403 },
    );
  }

  const [claimed] = await db
    .update(assessmentCandidates)
    .set({ userId: user.id })
    .where(eq(assessmentCandidates.id, result.candidate.id))
    .returning();

  return NextResponse.json({ candidate: claimed });
}
