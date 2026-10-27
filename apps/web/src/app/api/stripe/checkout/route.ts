import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { isPaymentsEnabled, isStripeCheckoutEnabled } from "@/lib/server/feature-flags";
import { isValidStripePlan } from "@/lib/server/stripe/config";
import { createCheckoutSession } from "@/lib/server/stripe/checkout";

interface CreateCheckoutBody {
  plan?: unknown;
}

/**
 * Creates a Stripe Checkout Session for a Pro or Founding purchase
 * (docs/implementation_plan/phase9.md §13). The client sends only a
 * `plan` string from a fixed allowlist — never a raw Stripe Price ID —
 * and the server translates it via config.ts's getPlanPriceId, which is
 * the only place a real configured Price ID ever enters a Stripe API
 * call from this endpoint.
 */
export async function POST(request: Request) {
  if (!isPaymentsEnabled() || !isStripeCheckoutEnabled()) {
    return NextResponse.json({ error: "Payments are not enabled" }, { status: 403 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CreateCheckoutBody | null;
  if (!isValidStripePlan(body?.plan)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }

  const result = await createCheckoutSession(user, body.plan);
  if (!result.ok) {
    const status = result.reason === "founding_sold_out" ? 409 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ url: result.url });
}
