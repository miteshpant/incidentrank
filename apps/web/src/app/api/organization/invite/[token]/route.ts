import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { organizations } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrgInviteByToken, acceptOrgInvitation, invitationState } from "@/lib/server/org-membership";
import { normalizeEmail } from "@/lib/server/invite-token";

/**
 * Preview an organization invitation without requiring sign-in yet, so
 * the invite landing page can show "You've been invited to join <Org>"
 * before authentication — mirrors
 * /api/assessment/invite/[token]'s preview route exactly. Never exposes
 * the token hash or any other invitation's data.
 *
 * Phase 10D data-minimization: never returns the invitation's email —
 * the client never rendered it and the actual email match happens
 * server-side (POST below) against Clerk's own verified email, so
 * returning it here was unnecessary exposure to anyone holding the
 * (random, bearer) invite link before sign-in.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await loadOrgInviteByToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  return NextResponse.json({
    organizationName: result.organization.name,
    organizationSlug: result.organization.slug,
    role: result.invitation.role,
    invitationState: invitationState(result.invitation),
  });
}

/**
 * Accepts the invitation. Identity matching: the signed-in user's
 * verified Clerk primary email must case-insensitively match the
 * invitation's email — same binding mechanism as candidate-assessment
 * invitations, reused rather than reinvented. See
 * acceptOrgInvitation for the atomic membership-creation transaction.
 */
interface AcceptInviteBody {
  businessTermsAccepted?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;

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

  const body = (await request.json().catch(() => null)) as AcceptInviteBody | null;
  const businessTermsAccepted = body?.businessTermsAccepted === true;

  const outcome = await acceptOrgInvitation(token, user, normalizeEmail(verifiedEmail), {
    businessTermsAccepted,
  });

  if (!outcome.ok) {
    if (outcome.reason === "not_found") {
      return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
    }
    if (outcome.reason === "revoked") {
      return NextResponse.json({ error: "This invitation has been revoked" }, { status: 410 });
    }
    if (outcome.reason === "expired") {
      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
    }
    if (outcome.reason === "business_terms_required") {
      return NextResponse.json(
        { error: "business_terms_required" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      {
        error:
          "Your signed-in account's email does not match the email this invitation was sent to",
      },
      { status: 403 },
    );
  }

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, outcome.membership.organizationId),
  });

  return NextResponse.json({
    membership: outcome.membership,
    alreadyAccepted: outcome.alreadyAccepted,
    organizationSlug: organization?.slug ?? null,
  });
}
