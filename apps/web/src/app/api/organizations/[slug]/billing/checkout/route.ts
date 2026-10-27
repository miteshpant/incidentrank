import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import {
  canMutate,
  loadOrganizationMembership,
  requireActiveOrganization,
} from "@/lib/server/organization-auth";
import {
  isOrgBillingEnabled,
  isOrgCreditPurchaseEnabled,
} from "@/lib/server/feature-flags";
import { isValidOrgCreditPlan } from "@/lib/server/stripe/org-credit-config";
import { createOrganizationCreditCheckoutSession } from "@/lib/server/stripe/organization-checkout";

interface CreateOrgCheckoutBody {
  plan?: unknown;
}

/**
 * Creates a Stripe Checkout Session for an organization assessment
 * credit purchase (docs/implementation_plan/phase10b.md §15/§16). The
 * client sends only a `plan` string from a fixed allowlist — never a
 * raw Stripe Price ID — and org-credit-config.ts is the only place that
 * string is translated into a real configured Price ID.
 *
 * Eligibility order per §16: auth -> resolve org -> verify membership ->
 * verify owner/admin role -> requireActiveOrganization -> verify billing
 * flags -> create checkout. A suspended or pending organization is
 * denied checkout creation outright (§29/§30/§53) — this is distinct
 * from §52/§54's "payment completes after suspension" case, which the
 * webhook handler (not this route) must still honor.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isOrgBillingEnabled() || !isOrgCreditPurchaseEnabled()) {
    return NextResponse.json({ error: "Organization billing is not enabled" }, { status: 403 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const membership = await loadOrganizationMembership(slug, user);
  if (!membership.ok) {
    return NextResponse.json(
      { error: membership.status === 404 ? "Not found" : "Forbidden" },
      { status: membership.status },
    );
  }
  if (!canMutate(membership.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeCheck = requireActiveOrganization(membership.organization);
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.reason }, { status: activeCheck.status });
  }

  const body = (await request.json().catch(() => null)) as CreateOrgCheckoutBody | null;
  if (!isValidOrgCreditPlan(body?.plan)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }

  const result = await createOrganizationCreditCheckoutSession(
    membership.organization,
    body.plan,
    user,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  return NextResponse.json({ url: result.url });
}
