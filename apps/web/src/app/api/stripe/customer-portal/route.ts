import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { isPaymentsEnabled } from "@/lib/server/feature-flags";
import { createCustomerPortalSession } from "@/lib/server/stripe/checkout";

/**
 * Creates a Stripe Billing Portal session for the signed-in user (docs/
 * implementation_plan/phase9.md §21). The portal itself is already
 * configured in the Stripe TEST MODE dashboard — this endpoint only
 * needs an existing stripeCustomers row to redirect into it.
 */
export async function POST() {
  if (!isPaymentsEnabled()) {
    return NextResponse.json({ error: "Payments are not enabled" }, { status: 403 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await createCustomerPortalSession(user);
  if (!result) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  return NextResponse.json({ url: result.url });
}
