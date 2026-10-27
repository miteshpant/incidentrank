import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { claimReferral, loadReferralByCode } from "@/lib/server/referrals";
import { isReferralsEnabled } from "@/lib/server/feature-flags";

/**
 * Preview a referral code without requiring sign-in yet — never exposes
 * the referrer's identity/email (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §14: "Do not include
 * user IDs or emails in the URL," and §27's broader "do not expose
 * invite lists/tokens" privacy rule — this preview only confirms the
 * code resolves to something claimable).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!isReferralsEnabled()) {
    return NextResponse.json({ error: "Invalid referral link" }, { status: 404 });
  }

  const { code } = await params;
  const result = await loadReferralByCode(code);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid referral link" }, { status: 404 });
  }

  const alreadyClaimed = result.referral.referredUserId !== null;
  const expired =
    !alreadyClaimed &&
    result.referral.status !== "revoked" &&
    result.referral.expiresAt !== null &&
    result.referral.expiresAt < new Date();
  const revoked = result.referral.status === "revoked";

  return NextResponse.json({ alreadyClaimed, expired, revoked });
}

/**
 * Claims the referral for the signed-in user. The referrer is resolved
 * purely from the code — never a client-supplied id.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!isReferralsEnabled()) {
    return NextResponse.json({ error: "Invalid referral link" }, { status: 404 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await params;
  const result = await loadReferralByCode(code);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid referral link" }, { status: 404 });
  }

  const claimed = await claimReferral(result.referral, user);
  if (!claimed.ok) {
    if (claimed.reason === "claimed_by_other") {
      return NextResponse.json(
        { error: "This referral link has already been claimed" },
        { status: 409 },
      );
    }
    if (claimed.reason === "expired" || claimed.reason === "revoked") {
      return NextResponse.json({ error: claimed.reason }, { status: 410 });
    }
    if (claimed.reason === "self_referral") {
      return NextResponse.json(
        { error: "You cannot claim your own referral link" },
        { status: 403 },
      );
    }
    if (claimed.reason === "already_attached_to_referral") {
      return NextResponse.json(
        { error: "You are already attached to a different referral" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "You're already an IncidentRank user, so this referral can't be claimed." },
      { status: 403 },
    );
  }

  return NextResponse.json({ passId: claimed.passId, alreadyClaimed: claimed.alreadyClaimed });
}
