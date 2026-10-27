import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getVerifiedPrimaryEmail } from "@/lib/server/verified-email";
import {
  loadPromotionalInviteByToken,
  redeemPromotionalInvite,
} from "@/lib/server/promotional-invites";
import { isPromotionalInvitesEnabled } from "@/lib/server/feature-flags";

/**
 * Preview an invitation without requiring sign-in yet — mirrors
 * /api/assessment/invite/[token]/route.ts's GET/POST pair exactly. Never
 * exposes the token hash, campaign internals, or any other recipient's
 * data — only this one invite's own status.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isPromotionalInvitesEnabled()) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  const { token } = await params;
  const result = await loadPromotionalInviteByToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  const alreadyRedeemed = result.invite.redeemedByUserId !== null;
  const expired =
    !alreadyRedeemed &&
    result.invite.status !== "revoked" &&
    result.invite.expiresAt < new Date();
  const revoked = result.invite.status === "revoked";

  return NextResponse.json({
    campaign: result.invite.campaign,
    email: result.invite.email,
    alreadyRedeemed,
    expired,
    revoked,
  });
}

/**
 * Redeem the invitation: verified email must match, atomically grants
 * exactly one Incident Pass. Repeated requests by the same invited user
 * are idempotent (returns the existing pass).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isPromotionalInvitesEnabled()) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  const result = await loadPromotionalInviteByToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  const verifiedEmail = await getVerifiedPrimaryEmail();
  const redeemed = await redeemPromotionalInvite(result.invite, user, verifiedEmail);

  if (!redeemed.ok) {
    if (redeemed.reason === "email_mismatch") {
      return NextResponse.json(
        {
          error:
            "This invitation was sent to a different email address. Sign in with the invited account to continue.",
        },
        { status: 403 },
      );
    }
    if (redeemed.reason === "claimed_by_other") {
      return NextResponse.json(
        { error: "This invitation has already been claimed" },
        { status: 409 },
      );
    }
    if (redeemed.reason === "expired") {
      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
    }
    return NextResponse.json({ error: "This invitation has been revoked" }, { status: 410 });
  }

  return NextResponse.json({ passId: redeemed.passId, alreadyRedeemed: redeemed.alreadyRedeemed });
}
