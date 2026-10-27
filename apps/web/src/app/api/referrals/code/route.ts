import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { createReferralCode } from "@/lib/server/referrals";
import { isReferralsEnabled } from "@/lib/server/feature-flags";

/**
 * Creates (or returns the existing) referral code for the signed-in
 * user. Only succeeds for an eligible referrer (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §14) — referral
 * functionality must never be exposed merely because the user has an
 * account (phase8loc.md Step 10).
 */
export async function POST() {
  if (!isReferralsEnabled()) {
    return NextResponse.json({ error: "Referrals are not enabled" }, { status: 403 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await createReferralCode(user.id);
  if (!result) {
    return NextResponse.json(
      { error: "You are not yet eligible to refer other engineers" },
      { status: 403 },
    );
  }

  return NextResponse.json({ code: result.code });
}
