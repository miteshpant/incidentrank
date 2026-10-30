import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { isPaymentsEnabled } from "@/lib/server/feature-flags";
import { evaluatePaidPracticeEntitlement } from "@/lib/server/stripe/entitlements";

/**
 * The client-fetchable "am I Pro/Founding" check — backs the header's
 * "Upgrade to Pro" badge (site-header.tsx). Always returns
 * paymentsEnabled alongside entitlement so the client can tell "no
 * entitlement because payments are off" apart from "no entitlement,
 * genuinely eligible to upgrade" without a second round trip — the
 * badge must never link to /pricing while payments are disabled.
 */
export async function GET() {
  const paymentsEnabled = isPaymentsEnabled();
  if (!paymentsEnabled) {
    return NextResponse.json({ entitlement: null, paymentsEnabled: false });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ entitlement: null, paymentsEnabled: true });
  }

  const entitlement = await evaluatePaidPracticeEntitlement(user.id);
  return NextResponse.json({ entitlement, paymentsEnabled: true });
}
